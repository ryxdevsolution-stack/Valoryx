const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/webPrintService-CP6BLOT7.js","assets/browser-WMsLFYTG.js","assets/vendor-xwJkGkVI.js","assets/billNumber-Bj2_t-HG.js","assets/regions-CQrqqUPI.js"])))=>i.map(i=>d[i]);
import{c as at,a as M,j as e,X as Ue,t as G,u as st,d as be,R as Le,e as fe,_ as Fe,f as rt,B as nt}from"./index-LfRnVn8B.js";import{r as m,u as ot,d as it,L as lt}from"./vendor-xwJkGkVI.js";import{D as dt,B as ct}from"./DashboardLayout-B1csmqpo.js";import{f as we}from"./billNumber-Bj2_t-HG.js";import{C as mt,T as pt}from"./SkeletonLoader-CLfnsjmi.js";import{f as xt,u as gt}from"./useCurrency-DVZ7Yr2d.js";import{P as He}from"./pencil-CiD_o7as.js";import{L as ze}from"./loader-circle-CrivgevZ.js";import{C as ve}from"./regions-CQrqqUPI.js";import{g as ut}from"./shopSettingsService-TYs56VaA.js";import{R as yt}from"./rotate-ccw-CIj8oVss.js";import{C as ht}from"./calendar-B2YgYlWR.js";import{F as Ie}from"./file-text-_7GqpS6o.js";import{U as bt}from"./user-rhf4vuho.js";import{C as ft}from"./clock-F1By69zb.js";import{W as Re}from"./wallet-3D_AcYgb.js";import{P as vt}from"./package-DIZkWPoJ.js";import{D as _t}from"./dollar-sign-DmwivUF0.js";import"./search-DfCX5mw6.js";import"./trending-up-CX2lX8At.js";import"./truck-DszXGxwv.js";import"./chevron-right-BdtRAjpK.js";import"./menu-ByQZsSXs.js";import"./zap-BeC3O6OO.js";import"./key-round-C4XQisyv.js";/**
 * @license lucide-react v0.548.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const wt=[["rect",{width:"14",height:"20",x:"5",y:"2",rx:"2",ry:"2",key:"1yt0o3"}],["path",{d:"M12 18h.01",key:"mhygvu"}]],kt=at("smartphone",wt),Nt=["Cash","UPI","Card","Credit Card","Bank Transfer"];function jt(s){if(typeof s!="string"||!s.trim().startsWith("["))return[];try{const o=JSON.parse(s);return Array.isArray(o)?o.map(r=>({payment_type:String(r.payment_type??r.PAYMENT_TYPE??"Cash"),amount:Math.round(Number(r.amount??r.AMOUNT??0)*100)/100})):[]}catch{return[]}}async function Pt(s){var j;const r=(j=(await M.get(`/billing/${s}`,{params:{exchange:1}})).data)==null?void 0:j.bill;if(!r)throw new Error("Bill not found");if(r.status==="cancelled")throw new Error("A cancelled bill cannot be edited");const N=r.bill_prefix?`${r.bill_prefix}-`:"";return{billId:s,billLabel:r.bill_no_display||`${N}${r.bill_number}`,total:Number(r.type==="gst"?r.final_amount:r.total_amount)||0,customer_name:/^walk-?in customer$/i.test(r.customer_name||"")?"":r.customer_name||"",customer_phone:r.customer_phone||"",customer_gstin:r.customer_gstin||"",paidSplits:jt(r.payment_type),version:String(r.version??"")}}async function $t(s,o){const r={expected_version:s.version};return o.customer_name.trim()!==s.customer_name&&(r.customer_name=o.customer_name.trim()),o.customer_phone.trim()!==s.customer_phone&&(r.customer_phone=o.customer_phone.trim()),o.customer_gstin.trim().toUpperCase()!==s.customer_gstin&&(r.customer_gstin=o.customer_gstin.trim()),o.paidSplits.some((j,p)=>{var f;return j.payment_type!==((f=s.paidSplits[p])==null?void 0:f.payment_type)})&&(r.paid_splits=o.paidSplits),Object.keys(r).length===1?null:(await M.patch(`/billing/${s.billId}/details`,r)).data}const _e="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm",Me=(s,o)=>{var r,N;return((N=(r=s==null?void 0:s.response)==null?void 0:r.data)==null?void 0:N.error)||(s==null?void 0:s.message)||o};function Ct({billId:s,currency:o,onClose:r,onSaved:N}){const[j,p]=m.useState(null),[f,$]=m.useState(null),[T,h]=m.useState(""),[C,J]=m.useState(!1);m.useEffect(()=>{let x=!1;return Pt(s).then(w=>{x||(p(w),$(w))}).catch(w=>{x||h(Me(w,"Could not load the bill"))}),()=>{x=!0}},[s]),m.useEffect(()=>{const x=w=>{w.key==="Escape"&&!C&&r()};return window.addEventListener("keydown",x),()=>window.removeEventListener("keydown",x)},[r,C]);const W=x=>`${o}${x.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}`,_=async()=>{if(!(!j||!f)){if(f.customer_name.trim()&&!f.customer_phone.trim()){h("Phone number is required when a customer name is entered");return}J(!0),h("");try{const x=await $t(j,f);N(x?`Bill #${j.billLabel} updated`:"No changes to save")}catch(x){h(Me(x,"Failed to update the bill"))}finally{J(!1)}}};return e.jsx("div",{className:"fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4",role:"dialog","aria-modal":"true","aria-labelledby":"edit-bill-title",onClick:()=>!C&&r(),children:e.jsxs("div",{className:"w-full max-w-md rounded-2xl bg-white dark:bg-gray-800 shadow-xl",onClick:x=>x.stopPropagation(),children:[e.jsxs("div",{className:"flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700",children:[e.jsxs("h2",{id:"edit-bill-title",className:"flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white",children:[e.jsx(He,{className:"w-4 h-4","aria-hidden":"true"}),"Edit Bill",j?` #${j.billLabel}`:""]}),e.jsx("button",{type:"button",onClick:r,disabled:C,"aria-label":"Close",className:"p-1 rounded text-gray-500 hover:text-gray-800 dark:hover:text-gray-200",children:e.jsx(Ue,{className:"w-5 h-5"})})]}),f?e.jsxs("form",{className:"p-5 space-y-4",onSubmit:x=>{x.preventDefault(),_()},children:[e.jsxs("div",{children:[e.jsx("label",{htmlFor:"edit-cust-name",className:"block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1",children:"Customer name"}),e.jsx("input",{id:"edit-cust-name",className:_e,value:f.customer_name,placeholder:"Walk-in Customer",onChange:x=>$({...f,customer_name:x.target.value})})]}),e.jsxs("div",{className:"grid grid-cols-2 gap-3",children:[e.jsxs("div",{children:[e.jsx("label",{htmlFor:"edit-cust-phone",className:"block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1",children:"Phone"}),e.jsx("input",{id:"edit-cust-phone",className:_e,inputMode:"tel",value:f.customer_phone,onChange:x=>$({...f,customer_phone:x.target.value.replace(/[^\d+ ]/g,"").slice(0,20)})})]}),e.jsxs("div",{children:[e.jsx("label",{htmlFor:"edit-cust-gstin",className:"block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1",children:"GSTIN"}),e.jsx("input",{id:"edit-cust-gstin",className:`${_e} uppercase`,value:f.customer_gstin,onChange:x=>$({...f,customer_gstin:x.target.value.slice(0,20)})})]})]}),e.jsxs("fieldset",{children:[e.jsx("legend",{className:"block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1",children:"Payments"}),f.paidSplits.length===0?e.jsx("p",{className:"text-xs text-gray-500 dark:text-gray-400",children:"This older bill has no itemised payments to change."}):e.jsx("div",{className:"space-y-2",children:f.paidSplits.map((x,w)=>e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx("span",{className:"w-24 text-sm font-semibold tabular-nums text-gray-900 dark:text-white",children:W(x.amount)}),e.jsx("select",{"aria-label":`Payment type for ${W(x.amount)}`,className:_e,value:x.payment_type,onChange:P=>$({...f,paidSplits:f.paidSplits.map((H,K)=>K===w?{...H,payment_type:P.target.value}:H)}),children:[...new Set([x.payment_type,...Nt])].map(P=>e.jsx("option",{value:P,children:P},P))})]},w))}),e.jsxs("p",{className:"mt-2 text-xs text-gray-500 dark:text-gray-400",children:["Amounts, items and prices can't change here — use ",e.jsx("strong",{children:"Exchange"})," for returns or swaps."]})]}),T&&e.jsx("p",{role:"alert",className:"text-sm text-red-600 dark:text-red-400",children:T}),e.jsxs("div",{className:"flex justify-end gap-2 pt-1",children:[e.jsx("button",{type:"button",onClick:r,disabled:C,className:"px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg",children:"Cancel"}),e.jsxs("button",{type:"submit",disabled:C,className:"inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50",children:[C&&e.jsx(ze,{className:"w-4 h-4 animate-spin"})," Update Bill"]})]})]}):e.jsx("div",{className:"p-8 flex justify-center",children:T?e.jsx("p",{role:"alert",className:"text-sm text-red-600 dark:text-red-400",children:T}):e.jsx(ze,{className:"w-6 h-6 animate-spin text-gray-400","aria-label":"Loading"})})]})})}function St(s){if(s.currency_symbol)return s.currency_symbol;if(s.currency_code&&ve[s.currency_code])return ve[s.currency_code];try{const o=JSON.parse(localStorage.getItem("client")||"{}");if(o.currency_symbol)return o.currency_symbol;if(o.currency_code&&ve[o.currency_code])return ve[o.currency_code]}catch{}return"₹"}function Dt(s){if(s.locale)return s.locale;try{const o=JSON.parse(localStorage.getItem("client")||"{}");if(o.locale)return o.locale}catch{}return"en-IN"}function Tt(s){const o=new Date(s),r=o.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}),N=o.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",hour12:!0});return`${r} | ${N}`}function Bt(s){try{const o=JSON.parse(s);if(Array.isArray(o))return o.map(r=>r.payment_name||r.payment_type||"Cash").join(" + ")}catch{}return s||"Cash"}function At(s){return!s||s.length<4?s:"••••••"+s.slice(-4)}function v(s){return s?s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"):""}async function Et(s){try{const o=await fetch(s,{mode:"cors"});if(!o.ok)return null;const r=await o.blob();return await new Promise((N,j)=>{const p=new FileReader;p.onloadend=()=>N(p.result),p.onerror=j,p.readAsDataURL(r)})}catch{return null}}async function Lt(s,o){var ie,te,ae;const r=s.type==="gst",N=r?s.final_amount:s.total_amount,j=s.payment_status==="pending",p=s.payment_status==="partial",f=Bt(s.payment_type),$=St(s),T=Dt(s),h=g=>xt(g,$,T);let C=null;o.logo_url&&(C=await Et(o.logo_url));const J=v(o.client_name.charAt(0).toUpperCase()),W=C?`<img src="${C}" alt="Logo" class="logo-img" />`:`<div class="logo-letter">${J}</div>`,x=[o.address,o.address2].filter(Boolean).map(v).join(", "),w=[],P=[];o.gstin&&w.push(`<div class="biz-row"><span class="biz-lbl">GSTIN</span><span class="biz-val">${v(o.gstin)}</span></div>`),P.push(`<div class="biz-row"><span class="biz-lbl">Legal Name</span><span class="biz-val">${v(o.client_name)}</span></div>`),o.phone&&w.push(`<div class="biz-row"><span class="biz-lbl">Phone</span><span class="biz-val">${v(o.phone)}</span></div>`),o.email&&P.push(`<div class="biz-row"><span class="biz-lbl">Email</span><span class="biz-val">${v(o.email)}</span></div>`),s.customer_gstin&&w.push(`<div class="biz-row"><span class="biz-lbl">Cust. GSTIN</span><span class="biz-val">${v(s.customer_gstin)}</span></div>`),P.push(`<div class="biz-row"><span class="biz-lbl">Bill Type</span><span class="biz-val">${r?"GST Invoice":"Invoice"}</span></div>`);const H=`
    <div class="biz-grid">
      <div class="biz-col">${w.join("")}</div>
      <div class="biz-col">${P.join("")}</div>
    </div>`,K=s.customer_name&&s.customer_name!=="Walk-in Customer"?v(s.customer_name.split(" ")[0]):null,ce=K?`Hi ${K}, here's your bill!`:"Here's your bill!",l=s.customer_phone?At(s.customer_phone):null,Y=((te=(ie=s.tax_breakdown)==null?void 0:ie[0])==null?void 0:te.name)||(()=>{var g;try{return(g=JSON.parse(localStorage.getItem("client")||"{}").tax_config)==null?void 0:g.name}catch{return}})()||"GST",L=r?`<th class="tc gst-th">${v(Y)} %</th>`:"",O=s.items.some(g=>Number(g.discount_percentage||0)>0),F=O?'<th class="tc">Disc %</th>':"",X=s.items.map((g,A)=>{const Ne=r?`<td class="tc muted">${g.gst_percentage}%</td>`:"",ue=Number(g.discount_percentage||0),se=O?`<td class="tc muted">${ue>0?`${ue}%`:"−"}</td>`:"";return`
      <tr class="${A%2===0?"":"row-alt"}">
        <td class="item-td">
          <span class="item-name">${v(g.product_name)}</span>
          ${g.item_code?`<span class="item-code">${v(g.item_code)}</span>`:""}
        </td>
        <td class="tc">${g.quantity}</td>
        <td class="tr">${h(g.rate)}</td>
        ${se}
        ${Ne}
        <td class="tr fw">${h(g.amount)}</td>
      </tr>`}).join(""),B=s.discount_amount||0,q=s.negotiable_amount||0,S=[];if(S.push(`<tr><td class="tot-lbl">Subtotal</td><td class="tot-val">${h(s.subtotal||N)}</td></tr>`),B>0){const g=s.discount_percentage?`Discount (${s.discount_percentage}%)`:"Discount";S.push(`<tr><td class="tot-lbl">${g}</td><td class="tot-val green">− ${h(B)}</td></tr>`)}else q>0&&S.push(`<tr><td class="tot-lbl">Negotiated</td><td class="tot-val green">− ${h(q)}</td></tr>`);const V=Number(s.membership_redeemed)||0;if(V>0){const g=(ae=s.membership)!=null&&ae.points_redeemed?`Points Redeemed (${s.membership.points_redeemed} pts)`:"Points Redeemed";S.push(`<tr><td class="tot-lbl">${g}</td><td class="tot-val green">− ${h(V)}</td></tr>`)}if(r){const g=s.tax_breakdown&&s.tax_breakdown.length>0?s.tax_breakdown:Number(s.cgst)||Number(s.sgst)?[{name:"CGST",amount:Number(s.cgst)||0},{name:"SGST",amount:Number(s.sgst)||0}]:[{name:"CGST",amount:(Number(s.gst_amount)||0)/2},{name:"SGST",amount:(Number(s.gst_amount)||0)/2}];for(const A of g)S.push(`<tr><td class="tot-lbl">${v(A.name)}</td><td class="tot-val">${h(Number(A.amount))}</td></tr>`)}const D=s.paid_amount!=null?Number(s.paid_amount):s.payment_status==="pending"?0:N,z=s.balance_due!=null?Number(s.balance_due):Math.max(N-D,0);z>0&&(S.push(`<tr><td class="tot-lbl">Paid</td><td class="tot-val green">${h(D)}</td></tr>`),S.push(`<tr><td class="tot-lbl"><strong>Balance Due</strong></td><td class="tot-val"><strong>${h(z)}</strong></td></tr>`));const Z=s.payments||[],me=Z.length>1||Z.length>0&&z>0?`
  <hr class="dash" style="margin-top:8px"/>
  <div class="totals-section">
    <div class="pay-hist-title">Payment History</div>
    <table class="tot-tbl">
      ${Z.map(g=>{const A=g.payment_date?new Date(g.payment_date).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}):"—";return`<tr><td class="tot-lbl">${v(A)} · ${v(g.payment_method||"Cash")}</td><td class="tot-val green">${h(Number(g.amount))}</td></tr>`}).join("")}
      ${z>0?`<tr><td class="tot-lbl"><strong>Still due</strong></td><td class="tot-val"><strong>${h(z)}</strong></td></tr>`:""}
    </table>
  </div>`:"",ne=o.receipt_footer?`<p class="footer-note">${v(o.receipt_footer)}</p>`:"",I=s.membership,pe=I?`<div class="points-panel">
         <div class="confetti-bg">
           <div class="points-inner">
             <div class="points-label">Member ${v(I.card_number||"")}</div>
             <div class="points-value">+${I.points_earned} Points</div>
             <div class="points-sub">Balance: ${I.points_balance} pts &middot; T&amp;C applied</div>
           </div>
         </div>
       </div>`:s.points_earned&&s.points_earned>0?`<div class="points-panel">
           <div class="confetti-bg">
             <div class="points-inner">
               <div class="points-label">You have earned</div>
               <div class="points-value">${s.points_earned.toFixed(2)} Points</div>
               <div class="points-sub">T&amp;C applied</div>
             </div>
           </div>
         </div>`:"",xe=j?'<div class="pending-banner">⏳ &nbsp;PAYMENT PENDING — NOT YET COLLECTED</div>':"",oe=`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Invoice #${we(s)} — ${v(o.client_name)}</title>
<style>
/* ── Reset ─────────────────────────────────────────── */
*{box-sizing:border-box;margin:0;padding:0}
:root{--brand:#6B0000;--brand-light:#fff5f5}   /* dark maroon; override per client if needed */

/* ── Page ──────────────────────────────────────────── */
body{
  font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;
  background:#ebebeb;
  min-height:100vh;
  display:flex;
  flex-direction:column;
  align-items:center;
  padding:28px 16px 40px;
  color:#1a1a1a;
}

/* ── Card ──────────────────────────────────────────── */
.card{
  background:#fff;
  width:100%;
  max-width:500px;
  border-radius:16px 16px 0 0;   /* bottom rounded by SVG wave */
  overflow:hidden;
  box-shadow:0 8px 40px rgba(0,0,0,.13);
}

/* ── Header (white bg, logo left, location right) ──── */
.hdr{
  background:#fff;
  padding:20px 22px 16px;
  display:flex;
  align-items:flex-start;
  justify-content:space-between;
  gap:12px;
}
.logo-circle{
  width:56px;height:56px;
  border-radius:50%;
  border:2.5px solid var(--brand);
  overflow:hidden;
  display:flex;align-items:center;justify-content:center;
  background:var(--brand-light);
  flex-shrink:0;
}
.logo-img{width:100%;height:100%;object-fit:cover;display:block}
.logo-letter{font-size:22px;font-weight:800;color:var(--brand)}
.location-block{text-align:right;flex:1}
.location-line{font-size:12px;color:#555;display:flex;align-items:center;justify-content:flex-end;gap:4px}
.location-pin{font-size:13px}
.view-store{font-size:11px;font-weight:700;color:var(--brand);text-decoration:underline;margin-top:3px;cursor:pointer;display:block;text-align:right}

/* ── Brand bar ─────────────────────────────────────── */
.brand-bar{height:4px;background:var(--brand)}

/* ── Pending banner ────────────────────────────────── */
.pending-banner{
  background:#fef3c7;border-bottom:2px solid #f59e0b;
  color:#92400e;text-align:center;padding:9px;
  font-size:11.5px;font-weight:700;letter-spacing:1.2px;
}

/* ── Business info 2-col grid ──────────────────────── */
.biz-section{padding:14px 22px}
.biz-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 16px}
.biz-col{}
.biz-row{margin-bottom:5px}
.biz-lbl{display:block;font-size:10px;color:#999;font-weight:500;text-transform:uppercase;letter-spacing:.5px}
.biz-val{display:block;font-size:12px;color:#1a1a1a;font-weight:600;margin-top:1px}

/* ── Dashed separator ──────────────────────────────── */
.dash{
  border:none;
  border-top:1.5px dashed #d8d8d8;
  margin:0 22px;
}

/* ── Greeting ──────────────────────────────────────── */
.greeting-row{
  padding:12px 22px;
  display:flex;align-items:center;justify-content:space-between;
}
.greeting-text{font-size:13.5px;font-weight:600;color:#1a1a1a}
.dl-icon{font-size:16px;color:var(--brand)}

/* ── Amount hero row ───────────────────────────────── */
.amount-hero{padding:14px 22px}
.amount-row-top{display:flex;align-items:flex-start;justify-content:space-between}
.amount-main{font-size:26px;font-weight:900;color:#1a1a1a;letter-spacing:-0.5px}
.amount-payment{font-size:13px;color:#666;margin-top:2px;font-weight:500}
.status-chip{
  display:inline-block;font-size:9px;font-weight:800;letter-spacing:1.5px;
  padding:3px 10px;border-radius:20px;text-transform:uppercase;margin-left:6px;
  vertical-align:middle;
}
.chip-paid{background:#d1fae5;color:#065f46;border:1.5px solid #6ee7b7}
.chip-pending{background:#fef3c7;color:#92400e;border:1.5px solid #fcd34d}

.amount-meta{text-align:right}
.meta-date{font-size:11.5px;color:#555;font-weight:500}
.meta-items{font-size:11px;color:#999;margin-top:2px}

/* ── Bill # + phone row ────────────────────────────── */
.bill-meta-row{
  padding:0 22px 14px;
  display:flex;justify-content:space-between;align-items:center;
}
.meta-pill{
  font-size:11px;color:#666;
  background:#f5f5f5;border-radius:6px;padding:3px 10px;
}
.meta-pill strong{color:#1a1a1a;font-weight:700}
.cashier-note{font-size:10.5px;color:#aaa}

/* ── Items table ───────────────────────────────────── */
.items-section{padding:0 22px 0}
.items-label{
  font-size:9.5px;font-weight:700;text-transform:uppercase;
  letter-spacing:1.5px;color:#aaa;
  margin-bottom:8px;
}
.items-tbl{border-collapse:collapse;width:100%}
.items-tbl th{
  font-size:10px;font-weight:700;text-transform:uppercase;
  letter-spacing:.5px;color:#999;
  padding:6px 4px 8px;
  border-bottom:1px dashed #ddd;
}
.items-tbl td{
  padding:9px 4px;font-size:12.5px;color:#1a1a1a;
  border-bottom:1px dashed #f0f0f0;
}
.row-alt td{background:#fdfdfd}
.item-td{max-width:180px}
.item-name{display:block;font-weight:700;color:#111}
.item-code{display:block;font-size:9.5px;color:#ccc;margin-top:1px}
.gst-th{color:#bbb}
.muted{color:#bbb;font-size:11.5px}
.tc{text-align:center}
.tr{text-align:right}
.fw{font-weight:700}

/* ── Totals ────────────────────────────────────────── */
.totals-section{padding:12px 22px 14px}
.pay-hist-title{font-size:11px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:.04em;margin-bottom:2px}
.tot-tbl{border-collapse:collapse;width:100%}
.tot-lbl{font-size:12px;color:#777;padding:5px 0}
.tot-val{font-size:12px;color:#333;text-align:right;padding:5px 0;font-weight:500}
.green{color:#059669}
.grand-row td{padding-top:10px !important;border-top:2px solid #1a1a1a !important}
.grand-lbl{font-size:15px;font-weight:900;color:#1a1a1a}
.grand-val{font-size:22px;font-weight:900;color:var(--brand);text-align:right}

/* ── Footer inside card ────────────────────────────── */
.card-footer{padding:14px 22px 0;text-align:center}
.footer-note{font-size:11px;color:#888;margin-bottom:6px;line-height:1.6}

/* ── Wavy bottom SVG ───────────────────────────────── */
.wave-wrap{display:block;line-height:0;margin-top:12px}
.wave-wrap svg{display:block;width:100%}

/* ── Loyalty points panel (below card) ─────────────── */
.points-panel{
  width:100%;max-width:500px;
  border-radius:0 0 16px 16px;
  overflow:hidden;
  box-shadow:0 8px 40px rgba(0,0,0,.13);
  margin-top:-1px;
}
.confetti-bg{
  background:linear-gradient(135deg,#fff9e6 0%,#fff3cc 40%,#fff9e6 100%);
  padding:18px 22px;
  text-align:center;
  position:relative;
  border-top:1px solid #ffe082;
}
.confetti-bg::before{
  content:'🎉 🎊 🎁 🎉 🎊';
  position:absolute;top:6px;left:0;right:0;
  font-size:11px;letter-spacing:8px;opacity:.4;
  text-align:center;
}
.points-inner{position:relative;z-index:1}
.points-label{font-size:12px;color:#a16207;font-weight:500;margin-bottom:2px}
.points-value{font-size:22px;font-weight:900;color:#92400e;letter-spacing:-0.5px}
.points-sub{font-size:10px;color:#b45309;margin-top:4px}

/* ── Actions (hidden on print) ─────────────────────── */
.actions{
  width:100%;max-width:500px;
  display:flex;gap:12px;justify-content:center;
  padding:18px 0 0;
}
.btn{
  padding:11px 32px;border-radius:10px;
  font-size:13px;font-weight:700;
  cursor:pointer;border:none;
  transition:all .15s ease;letter-spacing:.3px;
}
.btn:hover{transform:translateY(-1px);box-shadow:0 4px 14px rgba(0,0,0,.15)}
.btn-primary{background:var(--brand);color:#fff}
.btn-secondary{background:#fff;color:#555;border:1.5px solid #ddd}

/* ── Powered by ─────────────────────────────────────── */
.powered-row{
  width:100%;max-width:500px;
  text-align:center;padding:12px 0 4px;
  font-size:10px;color:#bbb;
}
.powered-row strong{color:#555}

/* ── Print ──────────────────────────────────────────── */
@media print{
  body{background:#fff;padding:0}
  .card{box-shadow:none;border-radius:0;max-width:100%}
  .points-panel,.powered-row,.actions{max-width:100%}
  .actions{display:none}
}
</style>
</head>
<body>

<!-- ═══ CARD ════════════════════════════════════════════ -->
<div class="card">

  <!-- Header: logo + location -->
  <div class="hdr">
    <div class="logo-circle">${W}</div>
    <div class="location-block">
      <div class="location-line">
        <span class="location-pin">📍</span>
        <span>${x}</span>
      </div>
      <span class="view-store">${v(o.client_name)}</span>
    </div>
  </div>

  <!-- Brand accent bar -->
  <div class="brand-bar"></div>

  ${xe}

  <!-- Business info 2-col -->
  <div class="biz-section">${H}</div>

  <hr class="dash"/>

  <!-- Greeting -->
  <div class="greeting-row">
    <span class="greeting-text">${ce}</span>
    <span class="dl-icon">⬇</span>
  </div>

  <hr class="dash"/>

  <!-- Amount hero -->
  <div class="amount-hero">
    <div class="amount-row-top">
      <div>
        <div class="amount-main">
          ${h(N)}
          <span class="${p||j?"status-chip chip-pending":"status-chip chip-paid"}">${p?"Partial":j?"Pending":"Paid"}</span>
        </div>
        <div class="amount-payment">${v(f)}</div>
      </div>
      <div class="amount-meta">
        <div class="meta-date">${Tt(s.created_at)}</div>
        <div class="meta-items">${s.items.length} item${s.items.length!==1?"s":""}</div>
      </div>
    </div>
  </div>

  <!-- Bill # + masked phone row -->
  <div class="bill-meta-row">
    <span class="meta-pill">Bill <strong>#${we(s)}</strong></span>
    ${l?`<span class="meta-pill">Mobile <strong>${v(l)}</strong></span>`:`<span class="cashier-note">Cashier: ${v(s.user_name||"Admin")}</span>`}
  </div>

  <hr class="dash"/>

  <!-- Items -->
  <div class="items-section">
    <div class="items-label">Items</div>
    <table class="items-tbl">
      <thead>
        <tr>
          <th style="text-align:left">Item</th>
          <th class="tc">Qty</th>
          <th class="tr">Rate</th>
          ${F}
          ${L}
          <th class="tr">Amt</th>
        </tr>
      </thead>
      <tbody>${X}</tbody>
    </table>
  </div>

  <hr class="dash" style="margin-top:8px"/>

  <!-- Totals -->
  <div class="totals-section">
    <table class="tot-tbl">
      ${S.join("")}
      <tr class="grand-row">
        <td class="grand-lbl">Grand Total</td>
        <td class="grand-val">${h(N)}</td>
      </tr>
    </table>
  </div>

  <!-- Payment history (partial / multi-instalment bills only) -->
  ${me}

  <!-- Footer note -->
  ${ne?`<div class="card-footer">${ne}</div>`:""}

  <!-- Wavy bottom SVG — colour matches page background (#ebebeb) -->
  <div class="wave-wrap">
    <svg viewBox="0 0 500 28" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M0,0 Q12.5,28 25,0 Q37.5,28 50,0 Q62.5,28 75,0 Q87.5,28 100,0 Q112.5,28 125,0 Q137.5,28 150,0 Q162.5,28 175,0 Q187.5,28 200,0 Q212.5,28 225,0 Q237.5,28 250,0 Q262.5,28 275,0 Q287.5,28 300,0 Q312.5,28 325,0 Q337.5,28 350,0 Q362.5,28 375,0 Q387.5,28 400,0 Q412.5,28 425,0 Q437.5,28 450,0 Q462.5,28 475,0 Q487.5,28 500,0 L500,28 L0,28 Z" fill="#ebebeb"/>
    </svg>
  </div>

</div>
<!-- ═══ END CARD ═════════════════════════════════════════ -->

<!-- Loyalty points panel (festive, below card) -->
${pe}

<!-- Powered by -->
<div class="powered-row">Powered by <strong>Valoryx</strong></div>

<!-- Action buttons -->
<div class="actions">
  <button class="btn btn-secondary" onclick="window.close()">Close</button>
  <button class="btn btn-primary" onclick="window.print()">Save as PDF / Print</button>
</div>

</body>
</html>`,k=new Blob([oe],{type:"text/html;charset=utf-8"}),ge=URL.createObjectURL(k);window.open(ge,"_blank","width=580,height=900,scrollbars=yes")||G.error("Popup blocked — please allow popups for this site to generate PDFs."),setTimeout(()=>URL.revokeObjectURL(ge),3e4)}function ia(){var Ee;const s=ot(),o=it(),{client:r,hasPermission:N}=st(),j=N("edit_bill_details"),{symbol:p,taxLabel:f}=gt(),[$,T]=m.useState([]),[h,C]=m.useState([]),[J,W]=m.useState(!0),[_,x]=m.useState("all"),[w,P]=m.useState(1),H=17,[K,ce]=m.useState(!1),[l,Y]=m.useState(null),[L,O]=m.useState("all"),[F,X]=m.useState(""),[B,q]=m.useState(""),[S,V]=m.useState(null),[D,z]=m.useState(null),[Z,ke]=m.useState(""),[me,ne]=m.useState("Cash"),[I,pe]=m.useState(!1),[xe,oe]=m.useState([]),[k,ge]=m.useState(null),ee=m.useRef(null),ie=m.useRef(!0);m.useEffect(()=>{g(),ut().then(ge).catch(()=>{})},[]),m.useEffect(()=>{if(ie.current){ie.current=!1;return}ee.current=null,g()},[o.key]),m.useEffect(()=>{const t=o.state;t!=null&&t.refreshAfterExchange&&(s(o.pathname,{replace:!0,state:{}}),ee.current=null,g())},[o.state]);const te=m.useMemo(()=>{const t=new Map;return $.forEach(a=>{if(!a.payment_type){t.set(a.bill_id,[]);return}const n=String(a.payment_type).trim();if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(n)){t.set(a.bill_id,[]);return}if(n.startsWith("["))try{const i=JSON.parse(n);if(Array.isArray(i)){t.set(a.bill_id,i.map(c=>c.PAYMENT_TYPE||c.payment_type||c.payment_name).filter(Boolean));return}}catch{}t.set(a.bill_id,[n])}),t},[$]),ae=t=>te.get(t.bill_id)??[],g=async()=>{ee.current=null;const t=(async()=>{try{W(!0);const n=(await M.get("/billing/list?limit=100&status=final")).data.bills||[];if(T(n),n.length>0){const i=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,c=new Set;n.forEach(y=>{if(!y.payment_type)return;const u=String(y.payment_type).trim();if(!i.test(u)){if(u.startsWith("["))try{const Q=JSON.parse(u);if(Array.isArray(Q)){Q.forEach(U=>{const de=U.PAYMENT_TYPE||U.payment_type||U.payment_name;de&&c.add(de)});return}}catch{}c.add(u)}});const d=["CASH","UPI","CARD","CREDIT CARD","NET BANKING","CHEQUE","CREDIT","WALLET"],b=Array.from(c).sort((y,u)=>{const Q=d.indexOf(y.toUpperCase()),U=d.indexOf(u.toUpperCase());return Q!==-1&&U!==-1?Q-U:Q!==-1?-1:U!==-1?1:y.localeCompare(u)});C(b.map(y=>({payment_type_id:y,payment_name:y})))}}catch{}finally{W(!1),ee.current=null}})();return ee.current=t,t},A=t=>t.status==="cancelled"?0:t.type==="gst"?parseFloat(String(t.final_amount||"0")):parseFloat(String(t.total_amount||"0")),Ne=(t,a)=>{const n=A(t);if(typeof t.payment_type=="string"&&t.payment_type.trim().startsWith("["))try{const i=JSON.parse(t.payment_type);if(Array.isArray(i)){const c=i.find(d=>(d.PAYMENT_TYPE||d.payment_type)===a);if(c)return parseFloat(String(c.AMOUNT||c.amount||0))}}catch{return t.payment_type===a?n:0}return t.payment_type===a?n:0},ue=t=>{const a=[];let n=0;return t.forEach(i=>{const c=ae(i);n++,c.length>1?c.forEach((d,b)=>{a.push({...i,displayPaymentType:d,displayAmount:Ne(i,d),isFirstPayment:b===0,paymentCount:c.length,billSequenceNumber:n})}):a.push({...i,displayPaymentType:c[0]||i.payment_type,displayAmount:A(i),isFirstPayment:!0,paymentCount:1,billSequenceNumber:n})}),a},se=m.useCallback(t=>{const a=t.getFullYear(),n=String(t.getMonth()+1).padStart(2,"0"),i=String(t.getDate()).padStart(2,"0");return`${a}-${n}-${i}`},[]),ye=m.useMemo(()=>se(new Date),[se]),R=m.useMemo(()=>$.filter(t=>{if(L==="all")return!0;const a=se(new Date(t.created_at));return L==="today"?a===ye:F&&B?a>=F&&a<=B:F?a>=F:B?a<=B:!0}),[$,L,F,B,ye,se]),je=m.useMemo(()=>ue(R),[R]),re=m.useMemo(()=>_==="all"?je:je.filter(t=>{const a=te.get(t.bill_id)??[],n=a.length===1&&a[0].includes("+")?a[0].split("+"):a;return _.includes("+")?n.length<=1?!1:[...n].sort().join("+")===_:n.length===1&&t.displayPaymentType===_}),[je,_,te]),le=Math.ceil(re.length/H),Pe=(w-1)*H,Oe=Pe+H,he=re.slice(Pe,Oe),Qe=m.useMemo(()=>R.reduce((t,a)=>t+A(a),0),[R]),Ge=m.useMemo(()=>re.reduce((t,a)=>t+a.displayAmount,0),[re]),We=m.useMemo(()=>h.map(t=>{let a=0,n=0;return R.forEach(i=>{const c=ae(i);c.length===1&&c[0]===t.payment_type_id&&(a+=1,n+=A(i))}),{...t,count:a,total:n}}),[h,R]),De=m.useMemo(()=>{const t=new Map;return R.forEach(a=>{const n=ae(a);if(n.length>1){const i=[...n].sort(),c=i.join("+"),d=t.get(c)||{count:0,total:0,types:i};d.count+=1,d.total+=A(a),t.set(c,d)}}),Array.from(t.entries()).map(([a,n])=>({id:a,name:a,count:n.count,total:n.total,types:n.types}))},[R]);m.useEffect(()=>{P(1)},[_,L,F,B]);const Ye=async t=>{try{ce(!0);let a=$.find(b=>b.bill_id===t);if((!(a!=null&&a.items)||a.items.length===0)&&(a=(await M.get(`/billing/${t}`)).data.bill),!a)throw new Error("Bill data not found");const n={bill_number:a.bill_number,customer_name:a.customer_name,customer_phone:a.customer_phone,items:a.items,subtotal:a.subtotal||a.total_amount||0,discount_percentage:a.discount_percentage,discount_amount:a.discount_amount,negotiable_amount:a.negotiable_amount||0,gst_amount:a.gst_amount||0,gst_percentage:a.gst_percentage||0,final_amount:a.final_amount||a.total_amount||0,total_amount:a.total_amount||a.subtotal||0,payment_type:a.payment_type,created_at:a.created_at,type:a.type,cgst:a.cgst||0,sgst:a.sgst||0,igst:a.igst||0,user_name:a.user_name||a.created_by_name||a.created_by||"Admin",payment_status:a.payment_status,paid_amount:a.paid_amount,balance_due:E(a)},i=r?{client_name:r.client_name,address:r.address,phone:r.phone,email:r.email,gstin:r.gstin,logo_url:r.logo_url,upi_id:r.upi_id||"",receipt_footer:r.receipt_footer||""}:{client_name:"Business Name",address:"",phone:"",email:"",gstin:"",logo_url:"",upi_id:"",receipt_footer:""},c=typeof window<"u"?window.electronAPI:null;if(c&&typeof c.silentPrint=="function")try{const{generateReceiptHtml:b,generateUpiQrDataUrl:y}=await Fe(async()=>{const{generateReceiptHtml:et,generateUpiQrDataUrl:tt}=await import("./webPrintService-CP6BLOT7.js");return{generateReceiptHtml:et,generateUpiQrDataUrl:tt}},__vite__mapDeps([0,1,2,3,4])),u=n.type==="gst"?Number(n.final_amount):Number(n.total_amount),Q=i.upi_id?await y(i.upi_id,i.client_name||"",u,n.bill_number):void 0,U=b(n,i,!0,Q),de=await c.silentPrint(U,null);if(!de.success)throw new Error(de.error||"Print failed")}catch(b){G.error("Print failed: "+(b.message||"Unknown error"))}else{const{printBill:b}=await Fe(async()=>{const{printBill:u}=await import("./webPrintService-CP6BLOT7.js");return{printBill:u}},__vite__mapDeps([0,1,2,3,4])),y=await b(n,i,!0);if(!y.success)throw new Error(y.message||"Print failed")}}catch(a){G.error(a.message||"Print failed. Please try again.")}finally{ce(!1)}},Te=async t=>{Y(t),oe([]),M.get(`/billing/${t.bill_id}/payments`).then(a=>{var n;return oe(((n=a.data)==null?void 0:n.payments)||[])}).catch(()=>{});try{const n=(await M.get(`/billing/${t.bill_id}`)).data.bill;Y(i=>i&&i.bill_id===t.bill_id?{...i,...n}:i),T(i=>i.map(c=>c.bill_id===t.bill_id?{...c,...n,payment_type:c.payment_type}:c))}catch{}},[Be,$e]=m.useState(null),qe=t=>$e(t),Ve=t=>{s(`/billing/create?exchange=${encodeURIComponent(t)}`)},Je=async(t,a)=>{V({billId:t,billNumber:a})},Ke=async()=>{var n,i;if(!S)return;const{billId:t,billNumber:a}=S;V(null);try{(await M.post(`/billing/${t}/cancel`)).data.success&&T(d=>d.map(b=>b.bill_id===t?{...b,status:"cancelled"}:b))}catch(c){const d=((i=(n=c.response)==null?void 0:n.data)==null?void 0:i.error)||"Failed to cancel bill";d.includes("already cancelled")?T(b=>b.map(y=>y.bill_id===t?{...y,status:"cancelled"}:y)):G.error(d)}},E=t=>{if(t.balance_due!=null)return Number(t.balance_due);const a=Number(t.final_amount??t.total_amount??0);return t.paid_amount!=null?Math.max(a-Number(t.paid_amount),0):t.payment_status==="pending"?a:0},Ce=t=>{var a;z(t),ke(E(t).toFixed(2)),ne(((a=h[0])==null?void 0:a.payment_name)||"Cash")},Xe=async()=>{var a,n,i;if(!D||I)return;const t=parseFloat(Z);if(!Number.isFinite(t)||t<=0){G.warning("Enter a valid amount");return}pe(!0);try{const d=(a=(await M.post(`/billing/${D.bill_id}/payments`,{amount:t,payment_method:me})).data)==null?void 0:a.bill,b=d?{payment_status:d.payment_status,paid_amount:d.paid_amount,balance_due:d.balance_due,payment_type:d.payment_type}:{payment_status:"paid"};T(y=>y.map(u=>u.bill_id===D.bill_id?{...u,...b}:u)),(l==null?void 0:l.bill_id)===D.bill_id&&(Y(y=>y&&{...y,...b}),M.get(`/billing/${D.bill_id}/payments`).then(y=>{var u;return oe(((u=y.data)==null?void 0:u.payments)||[])}).catch(()=>{})),G.success((d==null?void 0:d.payment_status)==="paid"?`Bill #${D.bill_number} fully paid`:`Payment recorded — balance ${p}${Number((d==null?void 0:d.balance_due)??0).toFixed(2)}`),z(null)}catch(c){G.error(((i=(n=c.response)==null?void 0:n.data)==null?void 0:i.error)||"Failed to record payment")}finally{pe(!1)}},Se=async t=>{const a={client_name:(k==null?void 0:k.shop_name)||(r==null?void 0:r.client_name)||"Business",address:(k==null?void 0:k.address1)||(r==null?void 0:r.address)||"",address2:(k==null?void 0:k.address2)||"",phone:(k==null?void 0:k.phone)||(r==null?void 0:r.phone)||"",gstin:(k==null?void 0:k.gst_number)||(r==null?void 0:r.gstin)||"",logo_url:(r==null?void 0:r.logo_url)||"",receipt_footer:(k==null?void 0:k.receipt_footer)||""},n=t.type==="gst",i=n?t.final_amount??0:t.total_amount??0,c={bill_number:t.bill_number,customer_name:t.customer_name||"Walk-in Customer",customer_phone:t.customer_phone||"",items:(t.items||[]).map(d=>({product_id:"",product_name:d.product_name,item_code:d.item_code||"",hsn_code:"",unit:"pcs",quantity:d.quantity,rate:d.rate,mrp:d.mrp,gst_percentage:d.gst_percentage??0,gst_amount:d.quantity*d.rate*(d.gst_percentage??0)/100,amount:d.amount})),subtotal:t.subtotal??i,discount_percentage:t.discount_percentage??0,discount_amount:t.discount_amount??0,negotiable_amount:t.negotiable_amount,gst_amount:t.gst_amount??0,final_amount:t.final_amount??i,total_amount:t.total_amount??i,payment_type:t.payment_type||"[]",created_at:t.created_at,type:n?"gst":"non-gst",cgst:t.cgst??0,sgst:t.sgst??0,igst:t.igst??0,tax_breakdown:t.tax_breakdown,user_name:t.user_name||"",payment_status:t.payment_status||"paid",paid_amount:t.paid_amount,balance_due:E(t),payments:await M.get(`/billing/${t.bill_id}/payments`).then(d=>{var b;return((b=d.data)==null?void 0:b.payments)||[]}).catch(()=>[])};await Lt(c,a)},Ze=t=>{const a=t.toUpperCase();return a.includes("CASH")?ct:a.includes("UPI")?kt:a.includes("CARD")?rt:a.includes("BANK")||a.includes("NET")?nt:a.includes("WALLET")?Re:a.includes("CHEQUE")||a.includes("CHECK")?Ie:_t},Ae=t=>{const a=t.toUpperCase();return a.includes("CASH")?{bg:"from-green-500 to-green-600",text:"text-green-600",border:"border-green-500"}:a.includes("UPI")?{bg:"from-purple-500 to-purple-600",text:"text-purple-600",border:"border-purple-500"}:a.includes("CARD")?{bg:"from-blue-500 to-blue-600",text:"text-blue-600",border:"border-blue-500"}:a.includes("BANK")||a.includes("NET")?{bg:"from-indigo-500 to-indigo-600",text:"text-indigo-600",border:"border-indigo-500"}:a.includes("WALLET")?{bg:"from-orange-500 to-orange-600",text:"text-orange-600",border:"border-orange-500"}:a.includes("CHEQUE")||a.includes("CHECK")?{bg:"from-teal-500 to-teal-600",text:"text-teal-600",border:"border-teal-500"}:a.includes("PENDING")?{bg:"from-amber-500 to-amber-600",text:"text-amber-600",border:"border-amber-500"}:{bg:"from-gray-500 to-gray-600",text:"text-gray-600",border:"border-gray-500"}};return e.jsxs(dt,{children:[e.jsxs("div",{className:"flex flex-col h-[calc(100vh-6rem)]",children:[e.jsx("div",{className:"flex-shrink-0 mb-2",children:e.jsxs("div",{className:"flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",children:[e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsxs("div",{children:[e.jsx("h1",{className:"text-lg font-bold text-gray-900 dark:text-white",children:"All Bills"}),e.jsx("p",{className:"text-[10px] text-gray-600 dark:text-gray-400",children:"Filter by date and payment method"})]}),e.jsxs(lt,{to:"/billing/restore",className:"flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors",children:[e.jsx(yt,{className:"w-3.5 h-3.5",strokeWidth:2}),"Cancelled Bills"]})]}),e.jsxs("div",{className:"flex flex-wrap items-center gap-1.5",children:[e.jsx("button",{type:"button",onClick:()=>{O("all"),X(""),q("")},className:`px-2 py-1 text-[10px] font-medium rounded transition-all ${L==="all"?"bg-slate-700 text-white":"bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"}`,children:"All"}),e.jsxs("button",{type:"button",onClick:()=>{O("today"),X(""),q("")},className:`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-all ${L==="today"?"bg-blue-600 text-white":"bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"}`,children:[e.jsx(ht,{className:"w-3 h-3"}),"Today"]}),e.jsx("div",{className:"w-px h-5 bg-gray-300 dark:bg-gray-600"}),e.jsxs("div",{className:"flex items-center gap-1",children:[e.jsx("span",{className:"text-[9px] text-gray-500 dark:text-gray-400",children:"From"}),e.jsx("input",{type:"date",value:F,max:B||ye,onChange:t=>{X(t.target.value),O("custom")},className:"text-sm font-semibold text-gray-900 dark:text-white bg-transparent border border-gray-300 dark:border-gray-600 rounded px-2 py-1 cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500"})]}),e.jsxs("div",{className:"flex items-center gap-1",children:[e.jsx("span",{className:"text-[9px] text-gray-500 dark:text-gray-400",children:"To"}),e.jsx("input",{type:"date",value:B,min:F,max:ye,onChange:t=>{q(t.target.value),O("custom")},className:"text-sm font-semibold text-gray-900 dark:text-white bg-transparent border border-gray-300 dark:border-gray-600 rounded px-2 py-1 cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500"})]}),L==="custom"&&(F||B)&&e.jsx("button",{type:"button",onClick:()=>{O("all"),X(""),q("")},className:"p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300",title:"Clear dates",children:e.jsx(be,{className:"w-3.5 h-3.5"})})]})]})}),J?e.jsxs("div",{className:"space-y-4",children:[e.jsx(mt,{count:4}),e.jsx(pt,{rows:10})]}):$.length===0?e.jsx("div",{className:"flex-1 flex items-center justify-center bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow",children:e.jsxs("div",{className:"text-center",children:[e.jsx("p",{className:"text-gray-600 dark:text-gray-400 text-base",children:"No bills found"}),e.jsx("p",{className:"text-gray-500 dark:text-gray-500 text-sm mt-1",children:"Create your first bill to get started"})]})}):e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"flex-shrink-0 mb-2 overflow-x-auto scrollbar-hide",children:e.jsxs("div",{className:"flex gap-1.5 pb-1 min-w-max",children:[e.jsxs("button",{type:"button",onClick:()=>{x("all"),g()},className:`group flex items-center gap-1.5 px-2 py-1.5 rounded-md border transition-all duration-200 ${_==="all"?"bg-gradient-to-br from-slate-700 to-slate-600 border-slate-600 shadow-md":"bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:border-slate-400 dark:hover:border-slate-500 hover:shadow-sm"}`,children:[e.jsx("div",{className:`p-1 rounded ${_==="all"?"bg-white/20":"bg-gray-100 dark:bg-gray-700"}`,children:e.jsx(Ie,{className:`w-3 h-3 ${_==="all"?"text-white":"text-gray-600 dark:text-gray-300"}`})}),e.jsxs("div",{className:"text-left",children:[e.jsx("p",{className:`text-[9px] font-medium ${_==="all"?"text-white/80":"text-gray-500 dark:text-gray-400"}`,children:"All Bills"}),e.jsxs("div",{className:"flex items-baseline gap-1",children:[e.jsx("span",{className:`text-sm font-bold ${_==="all"?"text-white":"text-gray-900 dark:text-white"}`,children:R.length}),e.jsxs("span",{className:`text-[10px] font-medium ${_==="all"?"text-white/80":"text-gray-600 dark:text-gray-400"}`,children:[p,Qe.toLocaleString("en-IN",{maximumFractionDigits:0})]})]})]})]}),We.map(t=>{const a=Ze(t.payment_name),n=Ae(t.payment_name),i=_===t.payment_type_id;return e.jsxs("button",{type:"button",onClick:()=>x(t.payment_type_id),className:`group flex items-center gap-1.5 px-2 py-1.5 rounded-md border transition-all duration-200 ${i?`bg-gradient-to-br ${n.bg} border-transparent shadow-md`:`bg-white dark:bg-gray-800 ${n.border} border-opacity-30 dark:border-opacity-30 hover:border-opacity-60 hover:shadow-sm`}`,children:[e.jsx("div",{className:`p-1 rounded ${i?"bg-white/20":`bg-${n.text.split("-")[1]}-50 dark:bg-${n.text.split("-")[1]}-900/20`}`,children:e.jsx(a,{className:`w-3 h-3 ${i?"text-white":n.text}`})}),e.jsxs("div",{className:"text-left",children:[e.jsx("p",{className:`text-[9px] font-medium uppercase tracking-wide ${i?"text-white/80":`${n.text} opacity-70`}`,children:t.payment_name}),e.jsxs("div",{className:"flex items-baseline gap-1",children:[e.jsx("span",{className:`text-sm font-bold ${i?"text-white":"text-gray-900 dark:text-white"}`,children:t.count}),e.jsxs("span",{className:`text-[10px] font-medium ${i?"text-white/80":"text-gray-600 dark:text-gray-400"}`,children:[p,t.total.toLocaleString("en-IN",{maximumFractionDigits:0})]})]})]})]},t.payment_type_id)}),De.length>0&&e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"w-px bg-gray-300 dark:bg-gray-600 mx-1 self-stretch"}),De.map(t=>{const a=_===t.id;return e.jsxs("button",{type:"button",onClick:()=>x(t.id),className:`group flex items-center gap-1.5 px-2 py-1.5 rounded-md border transition-all duration-200 ${a?"bg-gradient-to-br from-amber-500 to-orange-500 border-transparent shadow-md":"bg-white dark:bg-gray-800 border-amber-400 border-opacity-40 dark:border-opacity-40 hover:border-opacity-70 hover:shadow-sm"}`,children:[e.jsx("div",{className:`p-1 rounded ${a?"bg-white/20":"bg-amber-50 dark:bg-amber-900/20"}`,children:e.jsx(Le,{className:`w-3 h-3 ${a?"text-white":"text-amber-600"}`})}),e.jsxs("div",{className:"text-left",children:[e.jsx("p",{className:`text-[9px] font-medium uppercase tracking-wide ${a?"text-white/80":"text-amber-600 opacity-70"}`,children:t.name}),e.jsxs("div",{className:"flex items-baseline gap-1",children:[e.jsx("span",{className:`text-sm font-bold ${a?"text-white":"text-gray-900 dark:text-white"}`,children:t.count}),e.jsxs("span",{className:`text-[10px] font-medium ${a?"text-white/80":"text-gray-600 dark:text-gray-400"}`,children:[p,t.total.toLocaleString("en-IN",{maximumFractionDigits:0})]})]})]})]},t.id)})]})]})}),e.jsx("div",{className:"hidden md:block flex-1 min-h-0 overflow-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md",children:e.jsxs("table",{className:"w-full",children:[e.jsx("thead",{className:"bg-gradient-to-r from-slate-700 to-slate-600 dark:from-gray-700 dark:to-gray-600 sticky top-0 z-10",children:e.jsxs("tr",{children:[e.jsx("th",{className:"px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase",children:"Bill #"}),e.jsx("th",{className:"px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase",children:"Date"}),e.jsx("th",{className:"px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase",children:"Customer"}),e.jsx("th",{className:"px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase",children:"Phone"}),e.jsx("th",{className:"px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase",children:"Payment Type"}),e.jsx("th",{className:"px-2 py-1.5 text-right text-[10px] font-bold text-white uppercase",children:"Amount"}),e.jsx("th",{className:"px-2 py-1.5 text-center text-[10px] font-bold text-white uppercase",children:"Actions"})]})}),e.jsx("tbody",{className:"divide-y divide-gray-200 dark:divide-gray-700",children:he.map((t,a)=>{const n=t.displayPaymentType||"Unknown",i=Ae(n),c=t.paymentCount>1,d=t.isFirstPayment,y=new Set(re.slice(0,Pe+a+1).map(u=>u.billSequenceNumber)).size;return e.jsxs("tr",{className:`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer ${!t.isFirstPayment&&c?"border-t-0":""}`,onClick:()=>t.isFirstPayment&&Te(t),children:[e.jsx("td",{className:"px-2 py-1.5 whitespace-nowrap",children:t.isFirstPayment?e.jsxs("div",{className:"flex items-center gap-1 flex-wrap",children:[e.jsx("span",{className:`text-xs font-semibold ${t.status==="cancelled"?"text-gray-400 line-through":"text-gray-700 dark:text-gray-300"}`,children:y}),t.status==="cancelled"&&e.jsx("span",{className:"px-1.5 py-0.5 text-[8px] font-bold text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400 rounded uppercase",children:"Cancelled"}),t.payment_status==="pending"&&t.status!=="cancelled"&&e.jsx("span",{className:"px-1.5 py-0.5 text-[8px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 rounded uppercase",children:"Pending"}),t.payment_status==="partial"&&t.status!=="cancelled"&&e.jsxs("span",{className:"px-1.5 py-0.5 text-[8px] font-bold text-blue-700 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 rounded uppercase",children:["Due ",p,E(t).toLocaleString("en-IN")]})]}):e.jsx("span",{className:"text-xs text-gray-400 dark:text-gray-500 pl-2",children:"↳"})}),e.jsx("td",{className:"px-2 py-1.5 whitespace-nowrap",children:t.isFirstPayment?e.jsx("span",{className:"text-xs text-gray-600 dark:text-gray-400",children:new Date(t.created_at).toLocaleDateString("en-IN",{day:"2-digit",month:"2-digit",year:"numeric"})}):e.jsx("span",{className:"text-xs text-gray-400 dark:text-gray-500",children:"-"})}),e.jsx("td",{className:"px-2 py-1.5",children:t.isFirstPayment?e.jsx("span",{className:"text-xs text-gray-700 dark:text-gray-300",children:t.customer_name}):e.jsx("span",{className:"text-xs text-gray-400 dark:text-gray-500",children:"-"})}),e.jsx("td",{className:"px-2 py-1.5",children:t.isFirstPayment?e.jsx("span",{className:"text-xs text-gray-600 dark:text-gray-400",children:t.customer_phone}):e.jsx("span",{className:"text-xs text-gray-400 dark:text-gray-500",children:"-"})}),e.jsx("td",{className:"px-2 py-1.5 whitespace-nowrap",children:e.jsx("span",{className:`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-white bg-gradient-to-r ${i.bg} rounded-full uppercase shadow-sm`,children:n})}),e.jsx("td",{className:"px-2 py-1.5 text-right whitespace-nowrap",children:e.jsxs("span",{className:"text-xs font-bold text-gray-900 dark:text-white",children:[p,t.displayAmount.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})]})}),d?e.jsx("td",{className:"px-2 py-1.5 text-center whitespace-nowrap",rowSpan:t.paymentCount,children:e.jsxs("div",{className:"flex items-center justify-center gap-1 flex-wrap",children:[(t.payment_status==="pending"||t.payment_status==="partial")&&e.jsxs("button",{type:"button",onClick:u=>{u.stopPropagation(),Ce(t)},className:"inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 rounded transition-all border border-green-300 dark:border-green-700",title:`Receive payment (balance ${p}${E(t).toFixed(2)})`,children:[e.jsx(fe,{className:"w-3 h-3"}),"Receive"]}),j&&t.status!=="cancelled"&&e.jsxs("button",{type:"button",onClick:u=>{u.stopPropagation(),qe(t.bill_id)},className:"inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded transition-all",title:"Edit Bill",children:[e.jsx(He,{className:"w-3 h-3","aria-hidden":"true"}),"Edit"]}),j&&e.jsxs("button",{type:"button",onClick:u=>{u.stopPropagation(),Ve(t.bill_id)},className:"inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-all",title:"Exchange Bill",children:[e.jsx(Le,{className:"w-3 h-3"}),"Exchange"]}),e.jsxs("button",{type:"button",onClick:u=>{u.stopPropagation(),Ye(t.bill_id)},disabled:K,className:"inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed",title:"Print Bill",children:[e.jsx("svg",{className:"w-3 h-3",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"})}),"Print"]}),e.jsxs("button",{type:"button",onClick:u=>{u.stopPropagation(),Se(t)},className:"inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 rounded transition-all",title:"Download PDF",children:[e.jsx("svg",{className:"w-3 h-3",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"})}),"PDF"]}),e.jsxs("button",{type:"button",onClick:u=>{u.stopPropagation(),Je(t.bill_id,t.bill_number)},className:"inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded transition-all",title:"Cancel Bill",children:[e.jsx(be,{className:"w-3 h-3"}),"Cancel"]})]})}):null]},`${t.bill_id}-${t.displayPaymentType}-${a}`)})})]})}),e.jsx("div",{className:"md:hidden space-y-3",children:he.filter(t=>t.isFirstPayment!==!1).map(t=>{var a;return e.jsxs("div",{onClick:()=>Te(t),className:"cursor-pointer bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm active:bg-gray-50 dark:active:bg-gray-700 transition-colors",children:[e.jsxs("div",{className:"flex items-start justify-between gap-2 mb-2",children:[e.jsxs("div",{children:[e.jsxs("div",{className:"flex items-center gap-1.5",children:[e.jsxs("p",{className:"text-sm font-semibold text-gray-900 dark:text-white",children:["#",we(t)]}),t.payment_status==="pending"&&t.status!=="cancelled"&&e.jsx("span",{className:"px-1.5 py-0.5 text-[9px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 rounded uppercase",children:"Payment Pending"}),t.payment_status==="partial"&&t.status!=="cancelled"&&e.jsxs("span",{className:"px-1.5 py-0.5 text-[9px] font-bold text-blue-700 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 rounded uppercase",children:["Due ",p,E(t).toLocaleString("en-IN")]})]}),e.jsx("p",{className:"text-xs text-gray-500 dark:text-gray-400 mt-0.5",children:t.customer_name||"Walk-in"})]}),e.jsx("span",{className:`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${t.status==="cancelled"?"bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400":"bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"}`,children:t.displayPaymentType??t.payment_type})]}),e.jsxs("div",{className:"flex items-center justify-between text-xs text-gray-500 dark:text-gray-400",children:[e.jsx("span",{children:t.created_at?new Date(t.created_at).toLocaleDateString():""}),e.jsxs("span",{className:"text-sm font-bold text-gray-900 dark:text-white",children:[p,(a=t.displayAmount)==null?void 0:a.toLocaleString()]})]}),(t.payment_status==="pending"||t.payment_status==="partial")&&t.status!=="cancelled"&&e.jsxs("div",{className:"mt-2 flex gap-2",children:[e.jsxs("button",{type:"button",onClick:n=>{n.stopPropagation(),Ce(t)},className:"flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 rounded border border-green-300 dark:border-green-700",children:[e.jsx(fe,{className:"w-3.5 h-3.5"})," Receive ",p,E(t).toFixed(0)]}),e.jsxs("button",{type:"button",onClick:n=>{n.stopPropagation(),Se(t)},className:"flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 rounded",children:[e.jsx("svg",{className:"w-3.5 h-3.5",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"})}),"PDF"]})]})]},`${t.bill_id}-${t.displayPaymentType??t.payment_type}`)})}),le>1&&e.jsxs("div",{className:"flex-shrink-0 flex items-center justify-center gap-1 mt-1.5",children:[e.jsx("button",{type:"button",onClick:()=>P(t=>Math.max(1,t-1)),disabled:w===1,className:"px-2.5 py-1 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-[10px] font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed",children:"Previous"}),e.jsx("div",{className:"flex gap-1",children:Array.from({length:le},(t,a)=>a+1).map(t=>e.jsx("button",{type:"button",onClick:()=>P(t),className:`w-7 h-7 rounded-md text-[10px] font-bold transition-all ${w===t?"bg-gradient-to-br from-slate-700 to-slate-600 text-white shadow-md":"bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"}`,children:t},t))}),e.jsx("button",{type:"button",onClick:()=>P(t=>Math.min(le,t+1)),disabled:w===le,className:"px-2.5 py-1 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-[10px] font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed",children:"Next"})]}),e.jsx("div",{className:"flex-shrink-0 mt-1.5 bg-gradient-to-r from-slate-800 to-slate-700 dark:from-gray-800 dark:to-gray-700 rounded-lg border border-slate-600 dark:border-gray-600 shadow-lg px-3 py-2",children:e.jsxs("div",{className:"flex justify-between items-center",children:[e.jsxs("div",{className:"flex items-center gap-6",children:[e.jsxs("div",{children:[e.jsxs("p",{className:"text-slate-400 dark:text-gray-400 text-[10px] uppercase font-medium",children:["Page ",w," of ",le||1]}),e.jsxs("p",{className:"text-slate-300 dark:text-gray-300 text-xs font-semibold",children:[he.length," items"]})]}),e.jsxs("div",{className:"border-l border-slate-600 pl-6",children:[e.jsx("p",{className:"text-slate-400 dark:text-gray-400 text-[10px] uppercase font-medium",children:"Page Total"}),e.jsxs("p",{className:"text-yellow-400 text-sm font-bold",children:[p,he.reduce((t,a)=>t+a.displayAmount,0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})]})]})]}),e.jsxs("div",{className:"text-right",children:[e.jsx("p",{className:"text-slate-400 dark:text-gray-400 text-[10px] uppercase font-medium",children:_==="all"?`Grand Total (${R.length} bills)${L!=="all"?` • ${L==="today"?"Today":"Custom"}`:""}`:`${((Ee=h.find(t=>t.payment_type_id===_))==null?void 0:Ee.payment_name)||_} (${new Set(re.map(t=>t.bill_id)).size} bills)`}),e.jsxs("p",{className:"text-white text-lg font-bold",children:[p,Ge.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})]})]})]})})]})]}),l&&e.jsxs("div",{className:"fixed inset-0 z-50 flex justify-end",onClick:()=>Y(null),children:[e.jsx("div",{className:"absolute inset-0 bg-black/40 backdrop-blur-sm"}),e.jsxs("div",{className:"relative w-full max-w-md bg-white dark:bg-gray-900 h-full shadow-2xl overflow-y-auto flex flex-col",onClick:t=>t.stopPropagation(),children:[e.jsxs("div",{className:"flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800",children:[e.jsxs("div",{children:[e.jsxs("h2",{className:"text-base font-semibold text-gray-900 dark:text-white",children:["Bill #",we(l)]}),e.jsx("span",{className:`text-xs px-2 py-0.5 rounded-full font-medium ${l.type==="gst"?"bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300":"bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"}`,children:l.type==="gst"?"GST":"Non-GST"})]}),e.jsx("button",{type:"button",onClick:()=>Y(null),className:"p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors",children:e.jsx(Ue,{className:"w-5 h-5"})})]}),e.jsxs("div",{className:"px-5 py-4 grid grid-cols-2 gap-3 border-b border-gray-200 dark:border-gray-700",children:[e.jsxs("div",{className:"flex items-start gap-2",children:[e.jsx(bt,{className:"w-4 h-4 text-gray-400 mt-0.5 shrink-0"}),e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] text-gray-400 uppercase font-medium",children:"Customer"}),e.jsx("p",{className:"text-sm text-gray-800 dark:text-gray-200",children:l.customer_name||"Walk-In"}),l.customer_phone&&e.jsx("p",{className:"text-xs text-gray-500 dark:text-gray-400",children:l.customer_phone})]})]}),e.jsxs("div",{className:"flex items-start gap-2",children:[e.jsx(ft,{className:"w-4 h-4 text-gray-400 mt-0.5 shrink-0"}),e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] text-gray-400 uppercase font-medium",children:"Date"}),e.jsx("p",{className:"text-sm text-gray-800 dark:text-gray-200",children:new Date(l.created_at).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}),e.jsx("p",{className:"text-xs text-gray-500 dark:text-gray-400",children:new Date(l.created_at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})})]})]}),e.jsxs("div",{className:"flex items-start gap-2",children:[e.jsx(Re,{className:"w-4 h-4 text-gray-400 mt-0.5 shrink-0"}),e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] text-gray-400 uppercase font-medium",children:"Payment"}),e.jsx("p",{className:"text-sm text-gray-800 dark:text-gray-200",children:l.payment_type?(()=>{const t=l.payment_type;if(typeof t=="string"&&t.trim().startsWith("["))try{const a=JSON.parse(t);return Array.isArray(a)?a.map(n=>`${n.payment_type||n.PAYMENT_TYPE||""}${n.amount||n.AMOUNT?` ${p}${n.amount||n.AMOUNT}`:""}`).join(" + "):t}catch{return t}return t})():"—"})]})]}),l.status==="cancelled"&&e.jsxs("div",{className:"flex items-start gap-2",children:[e.jsx(be,{className:"w-4 h-4 text-red-400 mt-0.5 shrink-0"}),e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] text-gray-400 uppercase font-medium",children:"Status"}),e.jsx("p",{className:"text-sm text-red-500 font-medium",children:"Cancelled"})]})]})]}),e.jsxs("div",{className:"px-5 py-4 flex-1",children:[e.jsxs("div",{className:"flex items-center gap-2 mb-3",children:[e.jsx(vt,{className:"w-4 h-4 text-gray-400"}),e.jsx("h3",{className:"text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase",children:"Items"})]}),l.items&&l.items.length>0?e.jsx("div",{className:"space-y-2",children:l.items.map((t,a)=>e.jsxs("div",{className:"flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0",children:[e.jsxs("div",{className:"flex-1 min-w-0",children:[e.jsx("p",{className:"text-sm text-gray-800 dark:text-gray-200 truncate",children:t.product_name}),e.jsxs("p",{className:"text-xs text-gray-500 dark:text-gray-400",children:[t.quantity," × ",p,(t.rate||0).toLocaleString("en-IN"),t.gst_percentage?` + ${t.gst_percentage}% ${f}`:""]})]}),e.jsxs("p",{className:"text-sm font-medium text-gray-800 dark:text-gray-200 shrink-0 ml-3",children:[p,(t.amount||0).toLocaleString("en-IN",{minimumFractionDigits:2})]})]},a))}):e.jsx("p",{className:"text-sm text-gray-400 italic",children:"No item details available"})]}),e.jsxs("div",{className:"px-5 py-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 space-y-2",children:[l.type==="gst"&&l.subtotal!==void 0&&e.jsxs("div",{className:"flex justify-between text-sm text-gray-600 dark:text-gray-400",children:[e.jsx("span",{children:"Subtotal"}),e.jsxs("span",{children:[p,(l.subtotal||0).toLocaleString("en-IN",{minimumFractionDigits:2})]})]}),l.gst_amount!==void 0&&l.gst_amount>0&&e.jsxs("div",{className:"flex justify-between text-sm text-gray-600 dark:text-gray-400",children:[e.jsxs("span",{children:[f," (",l.gst_percentage||0,"%)"]}),e.jsxs("span",{children:[p,(l.gst_amount||0).toLocaleString("en-IN",{minimumFractionDigits:2})]})]}),l.discount_amount!==void 0&&l.discount_amount>0&&e.jsxs("div",{className:"flex justify-between text-sm text-red-500",children:[e.jsxs("span",{children:["Discount ",l.discount_percentage?`(${l.discount_percentage}%)`:""]}),e.jsxs("span",{children:["-",p,(l.discount_amount||0).toLocaleString("en-IN",{minimumFractionDigits:2})]})]}),e.jsxs("div",{className:"flex justify-between text-base font-bold text-gray-900 dark:text-white pt-2 border-t border-gray-200 dark:border-gray-700",children:[e.jsx("span",{children:"Total"}),e.jsxs("span",{children:[p,Number((l.final_amount??l.total_amount)||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})]})]}),E(l)>0&&l.status!=="cancelled"&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"flex justify-between text-sm text-green-700 dark:text-green-400",children:[e.jsx("span",{children:"Paid"}),e.jsxs("span",{children:[p,Number(l.paid_amount??0).toLocaleString("en-IN",{minimumFractionDigits:2})]})]}),e.jsxs("div",{className:"flex justify-between text-sm font-semibold text-red-600 dark:text-red-400",children:[e.jsx("span",{children:"Balance Due"}),e.jsxs("span",{children:[p,E(l).toLocaleString("en-IN",{minimumFractionDigits:2})]})]})]}),xe.length>0&&e.jsxs("div",{className:"mt-3 p-2.5 bg-gray-50 dark:bg-gray-900/40 rounded-lg border border-gray-200 dark:border-gray-700",children:[e.jsx("p",{className:"text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5",children:"Payment History"}),xe.map(t=>e.jsxs("div",{className:"flex justify-between text-xs text-gray-700 dark:text-gray-300 py-0.5",children:[e.jsxs("span",{children:[t.payment_date?new Date(t.payment_date).toLocaleDateString("en-IN",{day:"2-digit",month:"short"}):"—"," · ",t.payment_method||"Cash"]}),e.jsxs("span",{className:"font-medium",children:[p,Number(t.amount).toLocaleString("en-IN",{minimumFractionDigits:2})]})]},t.payment_id))]}),(l.payment_status==="pending"||l.payment_status==="partial")&&l.status!=="cancelled"&&e.jsxs("div",{className:`mt-3 flex items-center justify-between p-2.5 rounded-lg border ${l.payment_status==="partial"?"bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700":"bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700"}`,children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("span",{className:"text-sm",children:l.payment_status==="partial"?"💰":"⏳"}),e.jsx("span",{className:`text-sm font-semibold ${l.payment_status==="partial"?"text-blue-700 dark:text-blue-400":"text-amber-700 dark:text-amber-400"}`,children:l.payment_status==="partial"?`Partially Paid — ${p}${E(l).toFixed(2)} due`:"Payment Pending"})]}),e.jsxs("button",{type:"button",onClick:()=>Ce(l),className:"inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition",children:[e.jsx(fe,{className:"w-3.5 h-3.5"}),"Receive Payment"]})]}),e.jsx("div",{className:"mt-3 flex gap-2",children:e.jsxs("button",{type:"button",onClick:()=>Se(l),className:"flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 rounded-lg border border-purple-200 dark:border-purple-700 transition",children:[e.jsx("svg",{className:"w-4 h-4",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"})}),"Download PDF"]})})]})]})]}),D&&e.jsxs("div",{className:"fixed inset-0 z-[60] flex items-center justify-center",onClick:()=>!I&&z(null),children:[e.jsx("div",{className:"absolute inset-0 bg-black/50 backdrop-blur-sm"}),e.jsxs("div",{className:"relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 border border-gray-200 dark:border-gray-700",onClick:t=>t.stopPropagation(),children:[e.jsxs("div",{className:"flex items-center gap-3 mb-4",children:[e.jsx("div",{className:"w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0",children:e.jsx(fe,{className:"w-5 h-5 text-green-600 dark:text-green-400"})}),e.jsxs("div",{children:[e.jsxs("h3",{className:"text-base font-semibold text-gray-900 dark:text-white",children:["Receive Payment — Bill #",D.bill_number]}),e.jsxs("p",{className:"text-xs text-gray-500 dark:text-gray-400 mt-0.5",children:["Balance due: ",p,E(D).toLocaleString("en-IN",{minimumFractionDigits:2})]})]})]}),e.jsx("label",{className:"block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1",children:"Amount received now"}),e.jsx("input",{type:"number",min:"0.01",step:"0.01",max:E(D),value:Z,onChange:t=>ke(t.target.value),autoFocus:!0,className:"w-full px-3 py-2 mb-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-green-500"}),e.jsx("p",{className:"-mt-2 mb-3 text-[11px] text-gray-400 dark:text-gray-500",children:"A smaller amount records another instalment; the full balance settles the bill."}),e.jsx("label",{className:"block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1",children:"Payment method"}),e.jsx("select",{value:me,onChange:t=>ne(t.target.value),className:"w-full px-3 py-2 mb-4 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500",children:(h.length>0?h.map(t=>t.payment_name):["Cash","Card","UPI"]).map(t=>e.jsx("option",{value:t,children:t},t))}),e.jsxs("div",{className:"flex gap-2",children:[e.jsx("button",{type:"button",disabled:I,onClick:()=>z(null),className:"flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition disabled:opacity-50",children:"Cancel"}),e.jsx("button",{type:"button",disabled:I,onClick:Xe,className:"flex-1 px-4 py-2.5 text-sm font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 transition disabled:opacity-60",children:I?"Recording…":"Record Payment"})]})]})]}),S&&e.jsxs("div",{className:"fixed inset-0 z-[60] flex items-center justify-center",onClick:()=>V(null),children:[e.jsx("div",{className:"absolute inset-0 bg-black/50 backdrop-blur-sm"}),e.jsxs("div",{className:"relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 border border-gray-200 dark:border-gray-700",onClick:t=>t.stopPropagation(),children:[e.jsxs("div",{className:"flex items-center gap-3 mb-4",children:[e.jsx("div",{className:"w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0",children:e.jsx(be,{className:"w-5 h-5 text-red-600 dark:text-red-400"})}),e.jsxs("div",{children:[e.jsxs("h3",{className:"text-base font-semibold text-gray-900 dark:text-white",children:["Cancel Bill #",S.billNumber,"?"]}),e.jsx("p",{className:"text-xs text-gray-500 dark:text-gray-400 mt-0.5",children:"This will restore all item quantities to stock."})]})]}),e.jsxs("div",{className:"flex gap-2 mt-5",children:[e.jsx("button",{type:"button",onClick:()=>V(null),className:"flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition",children:"No, Keep Bill"}),e.jsx("button",{type:"button",onClick:Ke,className:"flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition",children:"Yes, Cancel Bill"})]})]})]}),Be&&e.jsx(Ct,{billId:Be,currency:p,onClose:()=>$e(null),onSaved:t=>{$e(null),G.success(t),g()}})]})}export{ia as default};
