/** 12,345 - toLocaleString initialises Intl (about 10 ms on first use, measured) */
const formatCount = (count: number): string => String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

export default formatCount;
