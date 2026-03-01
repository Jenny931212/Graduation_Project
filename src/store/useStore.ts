import { useStoreContext } from "./StoreProvider";

export function useStore() {
  return useStoreContext();
}
