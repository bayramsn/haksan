/** Keep auth forms readable on tablets and landscape without enlarging artwork. */
export function authLayout(width: number, height: number, artworkRatio: number) {
  const contentWidth = Math.min(Math.max(width, 0), 520);
  return {
    contentWidth,
    artworkHeight: width <= 520 && height > width
      ? contentWidth / artworkRatio
      : Math.min(contentWidth / artworkRatio, Math.max(height, 0) * 0.3, 280),
  };
}

export function androidSceneBottom(tabHeight: number, keyboardVisible: boolean) {
  return keyboardVisible ? 0 : tabHeight;
}
