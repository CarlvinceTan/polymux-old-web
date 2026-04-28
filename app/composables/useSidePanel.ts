export function useSidePanel() {
  const isCollapsed = useState<boolean>('side-panel-collapsed', () => false)

  function toggle() {
    isCollapsed.value = !isCollapsed.value
  }

  return { isCollapsed, toggle }
}
