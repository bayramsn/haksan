/** Same-stage change is a server no-op; reserve explicitly when already picking stock. */
export async function reserveProcessStock(
  currentStage: string | null | undefined,
  inventoryItemIds: readonly string[],
  changeStage: () => Promise<unknown>,
  reserve: (itemId: string) => Promise<unknown>,
): Promise<void> {
  if (currentStage !== 'stock_picking') {
    await changeStage();
    return;
  }
  for (const itemId of inventoryItemIds) await reserve(itemId);
}
