import React from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faFolder} from '@fortawesome/free-solid-svg-icons';
import VerticalSliderItem from './Interface/VerticalSliderItem';
import VerticalSlider from './VerticalSlider';
import {GroupedType, groupByPrefix} from '../../Library/Database/DatabaseGrouping';

/**
 * items of the same prefix (by label) in a group item - opened group shows its items in own slider,
 * open items of groups are remembered under storageKey + prefix
 */
type OptionsType = {
  enabled: boolean, storageKey: string, multiple?: boolean, fold?: string, onGroupContextMenu?: (event: React.MouseEvent, prefix: string) => void,
  /** label of item to open (item of the current tab) - its groups are opened too */
  reveal?: RevealType | null,
};
type RevealType = {label: string, seq: number};

/** id of item with the label or of group the item is in (prefixes of one level do not start one another) */
export const revealOf = (items: VerticalSliderItem[], reveal: RevealType | null | undefined): {id: string, seq: number} | null => {
  if (!reveal) return null;
  const item = items.find((entry) => !entry.group && entry.label === reveal.label)
    ?? items.find((entry) => entry.group && reveal.label.startsWith(entry.label));
  return item ? {id: item.id ?? item.label, seq: reveal.seq} : null;
};

const toItems = (entries: GroupedType<VerticalSliderItem>[], options: OptionsType, storageKey: string): VerticalSliderItem[] => entries.map((entry) => {
  if (entry.kind === 'item') return entry.item;
  const items = toItems(entry.items, options, `${storageKey}:${entry.prefix}`);
  return {
    id: `group:${entry.prefix}`,
    label: entry.prefix,
    chevron: true,
    group: true,
    onContextMenu: options.onGroupContextMenu ? (event: React.MouseEvent) => options.onGroupContextMenu!(event, entry.prefix) : undefined,
    suffix: (
      <span className="vertical-slider-group-count" title={`${entry.count} items starting with ${entry.prefix}`}>
        <FontAwesomeIcon icon={faFolder} /> {entry.count}
      </span>
    ),
    component: (
      <VerticalSlider
        items={items}
        reveal={options.reveal?.label.startsWith(entry.prefix) ? revealOf(items, options.reveal) : null}
        multiple={!!options.multiple}
        allowClose={true}
        automateOpenFirst={false}
        storageKey={`${storageKey}:${entry.prefix}`}
        fold={options.fold}
      />
    ),
  };
});

export default (items: VerticalSliderItem[], options: OptionsType): VerticalSliderItem[] => {
  if (!options.enabled) return items;
  return toItems(groupByPrefix(items, (item) => item.label), options, options.storageKey);
};
