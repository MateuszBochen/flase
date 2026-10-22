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
type OptionsType = {enabled: boolean, storageKey: string, multiple?: boolean, onGroupContextMenu?: (event: React.MouseEvent, prefix: string) => void};

const toItems = (entries: GroupedType<VerticalSliderItem>[], options: OptionsType, storageKey: string): VerticalSliderItem[] => entries.map((entry) => {
  if (entry.kind === 'item') return entry.item;
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
        items={toItems(entry.items, options, `${storageKey}:${entry.prefix}`)}
        multiple={!!options.multiple}
        allowClose={true}
        automateOpenFirst={false}
        storageKey={`${storageKey}:${entry.prefix}`}
      />
    ),
  };
});

export default (items: VerticalSliderItem[], options: OptionsType): VerticalSliderItem[] => {
  if (!options.enabled) return items;
  return toItems(groupByPrefix(items, (item) => item.label), options, options.storageKey);
};
