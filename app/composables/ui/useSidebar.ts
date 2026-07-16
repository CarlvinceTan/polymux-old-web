export function useSidebar() {
  const isCollapsed = useState<boolean>('sidebar-collapsed', () => false)

  function toggle() {
    isCollapsed.value = !isCollapsed.value
  }

  return { isCollapsed, toggle }
}
