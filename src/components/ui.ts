// Shared UI class tokens: docked, square-edged surfaces with hairline borders and labelled readouts.
export const ui = {
  // Surfaces
  bar: 'bg-[#e6e3dc] border-b border-[#9c968b]',
  panel: 'bg-[#f4f2ed] border border-[#8f897e] shadow-[0_2px_8px_rgba(28,25,23,0.12)]',
  popover: 'bg-[#f7f5f0] border border-[#8f897e] shadow-[0_4px_16px_rgba(28,25,23,0.18)]',
  windowHeader:
    'flex items-center justify-between h-7 pl-2 pr-0.5 bg-[#e6e3dc] border-b border-[#b3ada2] text-[12px] font-semibold text-stone-900',

  // Typography
  caption: 'text-[10px] font-semibold uppercase tracking-[0.08em] text-stone-500',
  mono: 'font-mono tabular-nums',

  // Readout field (label + inset value)
  field: 'flex items-center h-6 whitespace-nowrap border border-[#b3ada2] bg-[#fbfaf7] shadow-[inset_0_1px_1px_rgba(28,25,23,0.06)]',
  fieldLabel:
    'h-full flex items-center px-2 bg-[#eceae4] border-r border-[#b3ada2] text-[11px] text-stone-500',
  fieldValue: 'px-1.5 font-mono tabular-nums text-[12px] font-medium text-stone-900',

  // Buttons
  btn:
    'inline-flex items-center gap-1.5 h-6 px-2 whitespace-nowrap border border-transparent text-[12px] font-medium text-stone-700 hover:bg-[#f7f5f0] hover:border-[#b3ada2] hover:text-stone-950 transition-colors cursor-pointer select-none disabled:opacity-40 disabled:cursor-not-allowed',
  btnActive: '!bg-[#23324a] !border-[#23324a] !text-white',
  btnIcon:
    'inline-flex items-center justify-center h-6 w-6 border border-transparent text-stone-600 hover:bg-[#f7f5f0] hover:border-[#b3ada2] hover:text-stone-950 transition-colors cursor-pointer',

  // Joined button group
  group: 'inline-flex items-stretch h-6 border border-[#b3ada2] bg-[#fbfaf7] divide-x divide-[#b3ada2]',
  groupItem:
    'inline-flex items-center justify-center gap-1 px-2 min-w-[26px] text-[11px] font-semibold text-stone-600 hover:bg-white hover:text-stone-950 transition-colors cursor-pointer select-none',
  groupItemActive: '!bg-[#23324a] !text-white',

  // Menu rows
  menuItem:
    'w-full flex items-center gap-2 h-6 px-2 text-left text-[12px] text-stone-800 hover:bg-[#23324a] hover:text-white cursor-pointer group',

  divider: 'h-5 w-px bg-[#b3ada2]',
};

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');
