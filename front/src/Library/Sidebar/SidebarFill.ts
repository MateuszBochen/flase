/**
 * Lists of tables in sidebar use the whole height of sidebar.
 * Each list has height of its rows, when they do not fit, free space is shared: short lists keep all their rows,
 * long ones get equal rest (at least a few rows - then sidebar itself scrolls).
 * Heights are computed again when sidebar is resized or something is opened / closed / filtered in it.
 */

/** list is not squeezed under this number of rows */
const MIN_ROWS = 5;
/** gap kept at bottom of sidebar */
const BOTTOM_GAP = 4;

const lists = new Set<HTMLElement>();
let container: HTMLElement | null = null;
let resizeObserver: ResizeObserver | null = null;
let mutationObserver: MutationObserver | null = null;
let frame: number | null = null;

/** scrolling element of whole sidebar (list of connections) */
const containerOf = (list: HTMLElement): HTMLElement | null => list.closest<HTMLElement>('.resizable-column > .vertical-slider-root');

/** equal share of space, list which needs less gives the rest to others */
export const shareHeights = (available: number, wanted: number[], minimum: number[]): number[] => {
  const heights = wanted.map(() => 0);
  let rest = available;
  const order = wanted.map((height, index) => index).sort((a, b) => wanted[a] - wanted[b]);
  order.forEach((index, position) => {
    const share = rest / (order.length - position);
    heights[index] = Math.max(minimum[index], Math.min(wanted[index], Math.floor(share)));
    rest -= heights[index];
  });
  return heights;
};

const verticalPadding = (element: HTMLElement): number => {
  const style = getComputedStyle(element);
  return parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
};

/** height of content of sidebar with its padding */
const contentHeight = (element: HTMLElement): number => Array.from(element.children)
  .reduce((sum, child) => {
    const style = getComputedStyle(child);
    return sum + (child as HTMLElement).offsetHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
  }, verticalPadding(element));

const layout = () => {
  frame = null;
  if (!container || !container.isConnected) return;
  const visible = Array.from(lists).filter((list) => list.isConnected && container!.contains(list));
  if (!visible.length) return;

  const current = visible.map((list) => list.getBoundingClientRect().height);
  // scrollHeight is never less than height - list of few tables (filter) would keep old height
  const wanted = visible.map((list) => contentHeight(list));
  const minimum = visible.map((list, index) => {
    const row = (list.firstElementChild as HTMLElement | null)?.offsetHeight || 0;
    return Math.min(wanted[index], row * MIN_ROWS);
  });
  // everything in sidebar except the lists themselves (scrollHeight is never less than height of sidebar)
  const fixed = contentHeight(container) - current.reduce((sum, height) => sum + height, 0);
  const available = container.clientHeight - fixed - BOTTOM_GAP;

  const heights = shareHeights(available, wanted, minimum);
  visible.forEach((list, index) => {
    // all rows fit - natural height, list follows its content (filter) without waiting for next layout
    const height = heights[index] >= wanted[index] ? '' : `${heights[index] - verticalPadding(list)}px`;
    if (list.style.height !== height) {
      list.style.height = height;
    }
  });
};

const schedule = () => {
  if (frame === null) {
    frame = requestAnimationFrame(layout);
  }
};

const observe = (element: HTMLElement) => {
  if (container === element) return;
  resizeObserver?.disconnect();
  mutationObserver?.disconnect();
  container = element;
  resizeObserver = new ResizeObserver(schedule);
  resizeObserver.observe(element);
  // items opened / closed, tables loaded or filtered (heights set here change only attributes - not observed)
  mutationObserver = new MutationObserver(schedule);
  mutationObserver.observe(element, {childList: true, subtree: true});
};

const SidebarFill = {
  /** list of tables appeared in sidebar, returns function which removes it */
  register: (list: HTMLElement): (() => void) => {
    const element = containerOf(list);
    if (!element) {
      return () => undefined;
    }
    observe(element);
    lists.add(list);
    schedule();
    return () => {
      lists.delete(list);
      list.style.height = '';
      schedule();
    };
  },
};

export default SidebarFill;
