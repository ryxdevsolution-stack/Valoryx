function i(r){if(!r)return"";if(r.bill_no_display)return r.bill_no_display;const n=r.bill_number;return n==null||n===""?"":r.bill_prefix?`${r.bill_prefix}-${n}`:String(n)}export{i as f};
