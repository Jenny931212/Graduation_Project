import os
import io
import requests
import PIL.Image
import pandas as pd
from rapidfuzz import process, fuzz
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
from google import genai
from google.genai import types

# 設定與初始化

# --- 設定 ---
app = FastAPI(title="Prescription OCR & Translation API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API KEY
API_KEY = os.getenv("GEMINI_API_KEY")
if not API_KEY:
    raise RuntimeError(
        "GEMINI_API_KEY environment variable is required. "
        "Set it before starting the backend."
    )
client = genai.Client(api_key=API_KEY)

# ===== 載入藥物外觀資料庫 =====

def load_drug_database(csv_path: str = "data.csv") -> pd.DataFrame:
    """載入藥物外觀 CSV，並建立搜尋用的合併名稱欄位。"""
    try:
        df = pd.read_csv(csv_path)
        # 合併中英文品名，方便模糊比對
        df["_search_key"] = (
            df["中文品名"].fillna("") + " " + df["英文品名"].fillna("")
        ).str.strip().str.upper()
        return df
    except Exception as e:
        print(f"[WARNING] 無法載入藥物資料庫: {e}")
        return pd.DataFrame()

DRUG_DB = load_drug_database()

# ===== 藥物外觀比對 =====

class DrugAppearance(BaseModel):
    shape: Optional[str] = Field(None, description="形狀")
    color: Optional[str] = Field(None, description="顏色")
    size_mm: Optional[str] = Field(None, description="外觀尺寸 (mm)")
    marking: Optional[str] = Field(None, description="錠面標註")
    special_form: Optional[str] = Field(None, description="特殊劑型")
    image_urls: List[str] = Field(default_factory=list, description="外觀圖檔網址清單")
    matched_name_zh: Optional[str] = Field(None, description="比對到的中文品名")
    matched_name_en: Optional[str] = Field(None, description="比對到的英文品名")
    match_score: Optional[float] = Field(None, description="比對相似度 (0–100)")

def lookup_drug_appearance(drug_name: str, score_cutoff: int = 60) -> Optional[DrugAppearance]:
    """
    以藥品名稱（中文或英文）模糊比對 CSV 資料庫，回傳外觀資訊。
    若比對分數低於 score_cutoff 則回傳 None。
    """
    if DRUG_DB.empty or not drug_name:
        return None

    query = drug_name.strip().upper()
    choices = DRUG_DB["_search_key"].tolist()

    result = process.extractOne(
        query,
        choices,
        scorer=fuzz.token_set_ratio,
        score_cutoff=score_cutoff,
    )

    if result is None:
        return None

    matched_text, score, idx = result
    row = DRUG_DB.iloc[idx]

    # 處理多圖（以 ;;; 分隔）
    raw_urls = str(row.get("外觀圖檔連結", "") or "")
    image_urls = [u.strip() for u in raw_urls.split(";;;") if u.strip() and u.strip() != "nan"]

    # 處理多顏色（以 ;;; 分隔）
    raw_color = str(row.get("顏色", "") or "")
    color = "、".join({c.strip() for c in raw_color.split(";;;") if c.strip() and c.strip() != "nan"})

    # 標註整合
    mark1 = str(row.get("標註一", "") or "").strip()
    mark2 = str(row.get("標註二", "") or "").strip()
    marking_parts = [m for m in [mark1, mark2] if m and m != "nan"]
    marking = " / ".join(marking_parts) if marking_parts else None

    size_raw = row.get("外觀尺寸", None)
    size_str = f"{size_raw} mm" if pd.notna(size_raw) else None

    special_form_raw = str(row.get("特殊劑型", "") or "").strip()
    special_form = special_form_raw if special_form_raw and special_form_raw != "nan" else None

    return DrugAppearance(
        shape=str(row.get("形狀", "") or "").strip() or None,
        color=color or None,
        size_mm=size_str,
        marking=marking,
        special_form=special_form,
        image_urls=image_urls,
        matched_name_zh=str(row.get("中文品名", "") or "").strip() or None,
        matched_name_en=str(row.get("英文品名", "") or "").strip() or None,
        match_score=score,
    )

# ===== 定義資料結構 =====

class MedicineItem(BaseModel):
    drug_name: str = Field(..., description="藥品名稱 (英文/中文)")
    dosage: Optional[str] = Field(None, description="劑量 (例如 5mg, 0.1%)")
    quantity: str = Field(..., description="數量 (例如 1瓶, 28顆)")
    usage_zh: str = Field(..., description="中文服用說明 (例如：每日三次，飯後)")
    common_uses: Optional[str] = Field(None, description="此藥品的常見臨床用途或適應症 (例如：降血壓、消炎止痛、抗生素)")
    appearance: Optional[DrugAppearance] = Field(None, description="藥品外觀資訊（來自衛福部藥物資料庫比對）")

class PrescriptionResponse(BaseModel):
    clinic_name: str = Field(..., description="診所名稱")
    visit_date: Optional[str] = Field(None, description="就診日期")
    patient_name: Optional[str] = Field(None, description="病患姓名")
    medicines: List[MedicineItem] = Field(..., description="藥品清單")
    memo: Optional[str] = Field(None, description="醫囑或備註")

# Gemini 解析用的內部結構（不含 appearance，由後端補入）
class _MedicineItemRaw(BaseModel):
    drug_name: str
    dosage: Optional[str] = None
    quantity: str
    usage_zh: str
    common_uses: Optional[str] = None

class _PrescriptionRaw(BaseModel):
    clinic_name: str
    visit_date: Optional[str] = None
    patient_name: Optional[str] = None
    medicines: List[_MedicineItemRaw]
    memo: Optional[str] = None

# 接收圖片 URL
class ImageUrlInput(BaseModel):
    image_url: str = Field(..., description="藥單圖片URL", example="https://example.jpg")

# ===== 翻譯用資料結構 =====

class TranslationRequest(BaseModel):
    text: str = Field(..., description="要翻譯的文字內容")
    target_language: Optional[str] = Field(
        None,
        description="目標語言（僅在來源為中文時需要指定）。例如：'English'、'日本語'、'한국어'、'Español'。若來源為非中文，則自動翻成中文，此欄位忽略。"
    )

class TranslationResponse(BaseModel):
    detected_language: str = Field(..., description="偵測到的來源語言")
    target_language: str = Field(..., description="翻譯目標語言")
    original_text: str = Field(..., description="原始輸入文字")
    translated_text: str = Field(..., description="翻譯後的文字")

class TranslationResult(BaseModel):
    detected_language: str
    target_language: str
    translated_text: str

# ===== 藥單 OCR 處理 =====

def process_prescription_with_gemini(img: PIL.Image.Image) -> PrescriptionResponse:
    """
    將圖片傳送給 Gemini，要求進行 OCR、清理、結構化與翻譯。
    解析完成後，對每個藥品進行外觀資料庫比對並補入 appearance 欄位。
    """

    prompt = """
    你是一個專業的醫療輔助 AI。請分析這張台灣的藥單圖片。
    
    任務目標：
    1. **OCR與修正**：辨識藥名與用法，修正 OCR 造成的拼字錯誤 (例如 'OINTMEN' -> 'OINTMENT')。
    2. **資訊提取**：提取診所名稱、日期、病患姓名、藥品詳情。
    3. **common_uses**：根據藥品名稱與劑型，填寫該藥品在臨床上最常見的用途或適應症（繁體中文，簡短說明，例如「降血壓」、「消炎止痛」、「廣效抗生素」、「胃酸抑制劑」）。若無法判斷則填 null。
    
    輸出限制：
    - 請直接回傳符合 JSON Schema 的資料。
    - 若欄位無法辨識，請填 null。
    """

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash-lite",
            contents=[prompt, img],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=_PrescriptionRaw,
            )
        )

        raw = _PrescriptionRaw.model_validate_json(response.text)

        # 補入外觀資訊
        enriched_medicines = []
        for med in raw.medicines:
            appearance = lookup_drug_appearance(med.drug_name)
            enriched_medicines.append(
                MedicineItem(
                    drug_name=med.drug_name,
                    dosage=med.dosage,
                    quantity=med.quantity,
                    usage_zh=med.usage_zh,
                    common_uses=med.common_uses,
                    appearance=appearance,
                )
            )

        return PrescriptionResponse(
            clinic_name=raw.clinic_name,
            visit_date=raw.visit_date,
            patient_name=raw.patient_name,
            medicines=enriched_medicines,
            memo=raw.memo,
        )

    except Exception as e:
        print(f"AI Processing Error: {e}")
        raise HTTPException(status_code=500, detail=f"AI 解析失敗: {str(e)}")

# ===== 翻譯處理 =====

def process_translation_with_gemini(text: str, target_language: Optional[str]) -> TranslationResult:
    """
    使用 Gemini 偵測語言並進行翻譯：
    - 非中文 → 自動翻成繁體中文
    - 中文 → 翻成使用者指定的目標語言
    """

    target_hint = target_language if target_language else "（未指定，若來源為中文則請回傳錯誤提示）"

    prompt = f"""
你是一個專業的多語言翻譯 AI，請依照以下規則處理輸入文字：

## 規則
1. 先偵測輸入文字的語言。
2. 若輸入語言**不是中文**（包含簡體或繁體）：
   - 將文字翻譯成**繁體中文**。
   - target_language 固定填寫 "繁體中文"。
3. 若輸入語言**是中文**（簡體或繁體）：
   - 將文字翻譯成指定語言："{target_hint}"。
   - 若未指定目標語言，translated_text 請填寫 "請提供 target_language 參數以指定翻譯目標語言。"，target_language 填寫 "未指定"。

## 輸出格式（JSON）
請直接輸出符合以下結構的 JSON，不要加任何說明或 markdown：
{{
  "detected_language": "偵測到的語言名稱（例如 English、日本語、한국어）",
  "target_language": "實際翻譯目標語言名稱",
  "translated_text": "翻譯後的文字"
}}

## 輸入文字
{text}
"""

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash-lite",
            contents=[prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=TranslationResult
            )
        )

        return TranslationResult.model_validate_json(response.text)

    except Exception as e:
        print(f"Translation Error: {e}")
        raise HTTPException(status_code=500, detail=f"翻譯失敗: {str(e)}")

# ===== API Endpoints =====

@app.get("/")
def root():
    return {"message": "AI Prescription OCR & Translation Service is Running!"}

# --- 藥單分析：URL ---
@app.post("/analyze/url", response_model=PrescriptionResponse)
def analyze_from_url(data: ImageUrlInput):
    try:
        print(f"Downloading image from: {data.image_url}")
        resp = requests.get(data.image_url, timeout=10)
        resp.raise_for_status()

        image = PIL.Image.open(io.BytesIO(resp.content))
        result = process_prescription_with_gemini(image)

        return result

    except requests.exceptions.RequestException as e:
        raise HTTPException(status_code=400, detail=f"無法下載圖片: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"伺服器內部錯誤: {str(e)}")

# --- 藥單分析：上傳檔案 ---
from fastapi import UploadFile, File

@app.post("/analyze/upload", response_model=PrescriptionResponse)
async def analyze_upload_file(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        image = PIL.Image.open(io.BytesIO(contents))
        result = process_prescription_with_gemini(image)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"檔案解析失敗: {str(e)}")

# --- 翻譯 API ---
@app.post(
    "/translate",
    response_model=TranslationResponse,
    summary="智慧翻譯",
    description=(
        "自動偵測語言並翻譯。\n\n"
        "- **非中文輸入** → 自動翻譯成繁體中文，無需填寫 `target_language`。\n"
        "- **中文輸入** → 需指定 `target_language`（例如 `'English'`、`'日本語'`、`'한국어'`），翻譯成對應語言。"
    )
)
def translate_text(data: TranslationRequest):
    """
    Request body 範例（非中文 → 中文）：
    ```json
    { "text": "Take one tablet after each meal." }
    ```

    Request body 範例（中文 → 其他語言）：
    ```json
    { "text": "每日三次，飯後服用。", "target_language": "English" }
    ```
    """
    try:
        result = process_translation_with_gemini(data.text, data.target_language)

        return TranslationResponse(
            detected_language=result.detected_language,
            target_language=result.target_language,
            original_text=data.text,
            translated_text=result.translated_text,
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"翻譯服務發生錯誤: {str(e)}")
