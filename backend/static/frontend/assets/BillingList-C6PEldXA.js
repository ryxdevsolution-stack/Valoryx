const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/webPrintService-BYGG1w3I.js","assets/browser-BmVzNun3.js","assets/vendor-B1q2mvm2.js","assets/billNumber-Bj2_t-HG.js","assets/regions-CQrqqUPI.js"])))=>i.map(i=>d[i]);
import{c as We,t as V,u as Ye,a as F,j as e,d as ue,R as De,e as ye,X as qe,_ as Te,f as Ve,B as Je}from"./index-D0EDJ9bk.js";import{u as Ke,d as Xe,r as m,L as Ze}from"./vendor-B1q2mvm2.js";import{D as et,B as tt}from"./DashboardLayout-C2vwpjIk.js";import{f as be}from"./billNumber-Bj2_t-HG.js";import{C as at,T as rt}from"./SkeletonLoader-BU0uVvXX.js";import{f as st,u as nt}from"./useCurrency-DQ4OOpp-.js";import{C as he}from"./regions-CQrqqUPI.js";import{g as ot}from"./shopSettingsService-DgdrwzAs.js";import{R as it}from"./rotate-ccw-CqeYGxhC.js";import{C as dt}from"./calendar-Buqn4L_x.js";import{F as Ae}from"./file-text-D6Dv9D-p.js";import{U as lt}from"./user-Cjic3DFo.js";import{C as ct}from"./clock-BYmhor0x.js";import{W as Be}from"./wallet-BEUzchGN.js";import{P as pt}from"./package-CVsKUF-j.js";import{D as mt}from"./dollar-sign-DWLGGjvG.js";import"./search-BbNLigGB.js";import"./loader-circle-Cnyr9RTc.js";import"./trending-up-DlSukl9T.js";import"./truck-p5au4F2S.js";import"./chevron-right-Di3f-UfW.js";import"./menu-CKcpA49e.js";import"./zap-5p2l0pnA.js";/**
 * @license lucide-react v0.548.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const xt=[["rect",{width:"14",height:"20",x:"5",y:"2",rx:"2",ry:"2",key:"1yt0o3"}],["path",{d:"M12 18h.01",key:"mhygvu"}]],gt=We("smartphone",xt);function ut(r){if(r.currency_symbol)return r.currency_symbol;if(r.currency_code&&he[r.currency_code])return he[r.currency_code];try{const d=JSON.parse(localStorage.getItem("client")||"{}");if(d.currency_symbol)return d.currency_symbol;if(d.currency_code&&he[d.currency_code])return he[d.currency_code]}catch{}return"₹"}function yt(r){if(r.locale)return r.locale;try{const d=JSON.parse(localStorage.getItem("client")||"{}");if(d.locale)return d.locale}catch{}return"en-IN"}function ht(r){const d=new Date(r),c=d.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}),p=d.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",hour12:!0});return`${c} | ${p}`}function bt(r){try{const d=JSON.parse(r);if(Array.isArray(d))return d.map(c=>c.payment_name||c.payment_type||"Cash").join(" + ")}catch{}return r||"Cash"}function ft(r){return!r||r.length<4?r:"••••••"+r.slice(-4)}function h(r){return r?r.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"):""}async function vt(r){try{const d=await fetch(r,{mode:"cors"});if(!d.ok)return null;const c=await d.blob();return await new Promise((p,S)=>{const _=new FileReader;_.onloadend=()=>p(_.result),_.onerror=S,_.readAsDataURL(c)})}catch{return null}}async function wt(r,d){var ae,Y,B;const c=r.type==="gst",p=c?r.final_amount:r.total_amount,S=r.payment_status==="pending",_=r.payment_status==="partial",E=bt(r.payment_type),D=ut(r),fe=yt(r),w=g=>st(g,D,fe);let J=null;d.logo_url&&(J=await vt(d.logo_url));const f=h(d.client_name.charAt(0).toUpperCase()),ne=J?`<img src="${J}" alt="Logo" class="logo-img" />`:`<div class="logo-letter">${f}</div>`,X=[d.address,d.address2].filter(Boolean).map(h).join(", "),T=[],Z=[];d.gstin&&T.push(`<div class="biz-row"><span class="biz-lbl">GSTIN</span><span class="biz-val">${h(d.gstin)}</span></div>`),Z.push(`<div class="biz-row"><span class="biz-lbl">Legal Name</span><span class="biz-val">${h(d.client_name)}</span></div>`),d.phone&&T.push(`<div class="biz-row"><span class="biz-lbl">Phone</span><span class="biz-val">${h(d.phone)}</span></div>`),d.email&&Z.push(`<div class="biz-row"><span class="biz-lbl">Email</span><span class="biz-val">${h(d.email)}</span></div>`),r.customer_gstin&&T.push(`<div class="biz-row"><span class="biz-lbl">Cust. GSTIN</span><span class="biz-val">${h(r.customer_gstin)}</span></div>`),Z.push(`<div class="biz-row"><span class="biz-lbl">Bill Type</span><span class="biz-val">${c?"GST Invoice":"Invoice"}</span></div>`);const me=`
    <div class="biz-grid">
      <div class="biz-col">${T.join("")}</div>
      <div class="biz-col">${Z.join("")}</div>
    </div>`,o=r.customer_name&&r.customer_name!=="Walk-in Customer"?h(r.customer_name.split(" ")[0]):null,R=o?`Hi ${o}, here's your bill!`:"Here's your bill!",k=r.customer_phone?ft(r.customer_phone):null,I=((Y=(ae=r.tax_breakdown)==null?void 0:ae[0])==null?void 0:Y.name)||(()=>{var g;try{return(g=JSON.parse(localStorage.getItem("client")||"{}").tax_config)==null?void 0:g.name}catch{return}})()||"GST",$=c?`<th class="tc gst-th">${h(I)} %</th>`:"",M=r.items.some(g=>Number(g.discount_percentage||0)>0),P=M?'<th class="tc">Disc %</th>':"",ee=r.items.map((g,z)=>{const re=c?`<td class="tc muted">${g.gst_percentage}%</td>`:"",q=Number(g.discount_percentage||0),N=M?`<td class="tc muted">${q>0?`${q}%`:"−"}</td>`:"";return`
      <tr class="${z%2===0?"":"row-alt"}">
        <td class="item-td">
          <span class="item-name">${h(g.product_name)}</span>
          ${g.item_code?`<span class="item-code">${h(g.item_code)}</span>`:""}
        </td>
        <td class="tc">${g.quantity}</td>
        <td class="tr">${w(g.rate)}</td>
        ${N}
        ${re}
        <td class="tr fw">${w(g.amount)}</td>
      </tr>`}).join(""),U=r.discount_amount||0,H=r.negotiable_amount||0,v=[];if(v.push(`<tr><td class="tot-lbl">Subtotal</td><td class="tot-val">${w(r.subtotal||p)}</td></tr>`),U>0){const g=r.discount_percentage?`Discount (${r.discount_percentage}%)`:"Discount";v.push(`<tr><td class="tot-lbl">${g}</td><td class="tot-val green">− ${w(U)}</td></tr>`)}else H>0&&v.push(`<tr><td class="tot-lbl">Negotiated</td><td class="tot-val green">− ${w(H)}</td></tr>`);const Q=Number(r.membership_redeemed)||0;if(Q>0){const g=(B=r.membership)!=null&&B.points_redeemed?`Points Redeemed (${r.membership.points_redeemed} pts)`:"Points Redeemed";v.push(`<tr><td class="tot-lbl">${g}</td><td class="tot-val green">− ${w(Q)}</td></tr>`)}if(c){const g=r.tax_breakdown&&r.tax_breakdown.length>0?r.tax_breakdown:Number(r.cgst)||Number(r.sgst)?[{name:"CGST",amount:Number(r.cgst)||0},{name:"SGST",amount:Number(r.sgst)||0}]:[{name:"CGST",amount:(Number(r.gst_amount)||0)/2},{name:"SGST",amount:(Number(r.gst_amount)||0)/2}];for(const z of g)v.push(`<tr><td class="tot-lbl">${h(z.name)}</td><td class="tot-val">${w(Number(z.amount))}</td></tr>`)}const oe=r.paid_amount!=null?Number(r.paid_amount):r.payment_status==="pending"?0:p,A=r.balance_due!=null?Number(r.balance_due):Math.max(p-oe,0);A>0&&(v.push(`<tr><td class="tot-lbl">Paid</td><td class="tot-val green">${w(oe)}</td></tr>`),v.push(`<tr><td class="tot-lbl"><strong>Balance Due</strong></td><td class="tot-val"><strong>${w(A)}</strong></td></tr>`));const te=r.payments||[],G=te.length>1||te.length>0&&A>0?`
  <hr class="dash" style="margin-top:8px"/>
  <div class="totals-section">
    <div class="pay-hist-title">Payment History</div>
    <table class="tot-tbl">
      ${te.map(g=>{const z=g.payment_date?new Date(g.payment_date).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}):"—";return`<tr><td class="tot-lbl">${h(z)} · ${h(g.payment_method||"Cash")}</td><td class="tot-val green">${w(Number(g.amount))}</td></tr>`}).join("")}
      ${A>0?`<tr><td class="tot-lbl"><strong>Still due</strong></td><td class="tot-val"><strong>${w(A)}</strong></td></tr>`:""}
    </table>
  </div>`:"",ie=d.receipt_footer?`<p class="footer-note">${h(d.receipt_footer)}</p>`:"",O=r.membership,de=O?`<div class="points-panel">
         <div class="confetti-bg">
           <div class="points-inner">
             <div class="points-label">Member ${h(O.card_number||"")}</div>
             <div class="points-value">+${O.points_earned} Points</div>
             <div class="points-sub">Balance: ${O.points_balance} pts &middot; T&amp;C applied</div>
           </div>
         </div>
       </div>`:r.points_earned&&r.points_earned>0?`<div class="points-panel">
           <div class="confetti-bg">
             <div class="points-inner">
               <div class="points-label">You have earned</div>
               <div class="points-value">${r.points_earned.toFixed(2)} Points</div>
               <div class="points-sub">T&amp;C applied</div>
             </div>
           </div>
         </div>`:"",b=S?'<div class="pending-banner">⏳ &nbsp;PAYMENT PENDING — NOT YET COLLECTED</div>':"",we=`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Invoice #${be(r)} — ${h(d.client_name)}</title>
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
    <div class="logo-circle">${ne}</div>
    <div class="location-block">
      <div class="location-line">
        <span class="location-pin">📍</span>
        <span>${X}</span>
      </div>
      <span class="view-store">${h(d.client_name)}</span>
    </div>
  </div>

  <!-- Brand accent bar -->
  <div class="brand-bar"></div>

  ${b}

  <!-- Business info 2-col -->
  <div class="biz-section">${me}</div>

  <hr class="dash"/>

  <!-- Greeting -->
  <div class="greeting-row">
    <span class="greeting-text">${R}</span>
    <span class="dl-icon">⬇</span>
  </div>

  <hr class="dash"/>

  <!-- Amount hero -->
  <div class="amount-hero">
    <div class="amount-row-top">
      <div>
        <div class="amount-main">
          ${w(p)}
          <span class="${_||S?"status-chip chip-pending":"status-chip chip-paid"}">${_?"Partial":S?"Pending":"Paid"}</span>
        </div>
        <div class="amount-payment">${h(E)}</div>
      </div>
      <div class="amount-meta">
        <div class="meta-date">${ht(r.created_at)}</div>
        <div class="meta-items">${r.items.length} item${r.items.length!==1?"s":""}</div>
      </div>
    </div>
  </div>

  <!-- Bill # + masked phone row -->
  <div class="bill-meta-row">
    <span class="meta-pill">Bill <strong>#${be(r)}</strong></span>
    ${k?`<span class="meta-pill">Mobile <strong>${h(k)}</strong></span>`:`<span class="cashier-note">Cashier: ${h(r.user_name||"Admin")}</span>`}
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
          ${P}
          ${$}
          <th class="tr">Amt</th>
        </tr>
      </thead>
      <tbody>${ee}</tbody>
    </table>
  </div>

  <hr class="dash" style="margin-top:8px"/>

  <!-- Totals -->
  <div class="totals-section">
    <table class="tot-tbl">
      ${v.join("")}
      <tr class="grand-row">
        <td class="grand-lbl">Grand Total</td>
        <td class="grand-val">${w(p)}</td>
      </tr>
    </table>
  </div>

  <!-- Payment history (partial / multi-instalment bills only) -->
  ${G}

  <!-- Footer note -->
  ${ie?`<div class="card-footer">${ie}</div>`:""}

  <!-- Wavy bottom SVG — colour matches page background (#ebebeb) -->
  <div class="wave-wrap">
    <svg viewBox="0 0 500 28" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M0,0 Q12.5,28 25,0 Q37.5,28 50,0 Q62.5,28 75,0 Q87.5,28 100,0 Q112.5,28 125,0 Q137.5,28 150,0 Q162.5,28 175,0 Q187.5,28 200,0 Q212.5,28 225,0 Q237.5,28 250,0 Q262.5,28 275,0 Q287.5,28 300,0 Q312.5,28 325,0 Q337.5,28 350,0 Q362.5,28 375,0 Q387.5,28 400,0 Q412.5,28 425,0 Q437.5,28 450,0 Q462.5,28 475,0 Q487.5,28 500,0 L500,28 L0,28 Z" fill="#ebebeb"/>
    </svg>
  </div>

</div>
<!-- ═══ END CARD ═════════════════════════════════════════ -->

<!-- Loyalty points panel (festive, below card) -->
${de}

<!-- Powered by -->
<div class="powered-row">Powered by <strong>Valoryx</strong></div>

<!-- Action buttons -->
<div class="actions">
  <button class="btn btn-secondary" onclick="window.close()">Close</button>
  <button class="btn btn-primary" onclick="window.print()">Save as PDF / Print</button>
</div>

</body>
</html>`,W=new Blob([we],{type:"text/html;charset=utf-8"}),le=URL.createObjectURL(W);window.open(le,"_blank","width=580,height=900,scrollbars=yes")||V.error("Popup blocked — please allow popups for this site to generate PDFs."),setTimeout(()=>URL.revokeObjectURL(le),3e4)}function Ot(){var Se;const r=Ke(),d=Xe(),{client:c}=Ye(),{symbol:p,taxLabel:S}=nt(),[_,E]=m.useState([]),[D,fe]=m.useState([]),[w,J]=m.useState(!0),[f,ne]=m.useState("all"),[K,X]=m.useState(1),T=17,[Z,me]=m.useState(!1),[o,R]=m.useState(null),[k,I]=m.useState("all"),[$,M]=m.useState(""),[P,ee]=m.useState(""),[U,H]=m.useState(null),[v,Q]=m.useState(null),[oe,A]=m.useState(""),[te,ve]=m.useState("Cash"),[G,ie]=m.useState(!1),[O,de]=m.useState([]),[b,we]=m.useState(null),W=m.useRef(null),le=m.useRef(!0);m.useEffect(()=>{Y(),ot().then(we).catch(()=>{})},[]),m.useEffect(()=>{if(le.current){le.current=!1;return}W.current=null,Y()},[d.key]),m.useEffect(()=>{const t=d.state;t!=null&&t.refreshAfterExchange&&(r(d.pathname,{replace:!0,state:{}}),W.current=null,Y())},[d.state]);const xe=m.useMemo(()=>{const t=new Map;return _.forEach(a=>{if(!a.payment_type){t.set(a.bill_id,[]);return}const s=String(a.payment_type).trim();if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)){t.set(a.bill_id,[]);return}if(s.startsWith("["))try{const n=JSON.parse(s);if(Array.isArray(n)){t.set(a.bill_id,n.map(l=>l.PAYMENT_TYPE||l.payment_type||l.payment_name).filter(Boolean));return}}catch{}t.set(a.bill_id,[s])}),t},[_]),ae=t=>xe.get(t.bill_id)??[],Y=async()=>{W.current=null;const t=(async()=>{try{J(!0);const s=(await F.get("/billing/list?limit=100&status=final")).data.bills||[];if(E(s),s.length>0){const n=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,l=new Set;s.forEach(u=>{if(!u.payment_type)return;const x=String(u.payment_type).trim();if(!n.test(x)){if(x.startsWith("["))try{const L=JSON.parse(x);if(Array.isArray(L)){L.forEach(C=>{const pe=C.PAYMENT_TYPE||C.payment_type||C.payment_name;pe&&l.add(pe)});return}}catch{}l.add(x)}});const i=["CASH","UPI","CARD","CREDIT CARD","NET BANKING","CHEQUE","CREDIT","WALLET"],y=Array.from(l).sort((u,x)=>{const L=i.indexOf(u.toUpperCase()),C=i.indexOf(x.toUpperCase());return L!==-1&&C!==-1?L-C:L!==-1?-1:C!==-1?1:u.localeCompare(x)});fe(y.map(u=>({payment_type_id:u,payment_name:u})))}}catch{}finally{J(!1),W.current=null}})();return W.current=t,t},B=t=>t.status==="cancelled"?0:t.type==="gst"?parseFloat(String(t.final_amount||"0")):parseFloat(String(t.total_amount||"0")),g=(t,a)=>{const s=B(t);if(typeof t.payment_type=="string"&&t.payment_type.trim().startsWith("["))try{const n=JSON.parse(t.payment_type);if(Array.isArray(n)){const l=n.find(i=>(i.PAYMENT_TYPE||i.payment_type)===a);if(l)return parseFloat(String(l.AMOUNT||l.amount||0))}}catch{return t.payment_type===a?s:0}return t.payment_type===a?s:0},z=t=>{const a=[];let s=0;return t.forEach(n=>{const l=ae(n);s++,l.length>1?l.forEach((i,y)=>{a.push({...n,displayPaymentType:i,displayAmount:g(n,i),isFirstPayment:y===0,paymentCount:l.length,billSequenceNumber:s})}):a.push({...n,displayPaymentType:l[0]||n.payment_type,displayAmount:B(n),isFirstPayment:!0,paymentCount:1,billSequenceNumber:s})}),a},re=m.useCallback(t=>{const a=t.getFullYear(),s=String(t.getMonth()+1).padStart(2,"0"),n=String(t.getDate()).padStart(2,"0");return`${a}-${s}-${n}`},[]),q=m.useMemo(()=>re(new Date),[re]),N=m.useMemo(()=>_.filter(t=>{if(k==="all")return!0;const a=re(new Date(t.created_at));return k==="today"?a===q:$&&P?a>=$&&a<=P:$?a>=$:P?a<=P:!0}),[_,k,$,P,q,re]),_e=m.useMemo(()=>z(N),[N]),se=m.useMemo(()=>f==="all"?_e:_e.filter(t=>{const a=xe.get(t.bill_id)??[],s=a.length===1&&a[0].includes("+")?a[0].split("+"):a;return f.includes("+")?s.length<=1?!1:[...s].sort().join("+")===f:s.length===1&&t.displayPaymentType===f}),[_e,f,xe]),ce=Math.ceil(se.length/T),ke=(K-1)*T,ze=ke+T,ge=se.slice(ke,ze),Le=m.useMemo(()=>N.reduce((t,a)=>t+B(a),0),[N]),Fe=m.useMemo(()=>se.reduce((t,a)=>t+a.displayAmount,0),[se]),Ee=m.useMemo(()=>D.map(t=>{let a=0,s=0;return N.forEach(n=>{const l=ae(n);l.length===1&&l[0]===t.payment_type_id&&(a+=1,s+=B(n))}),{...t,count:a,total:s}}),[D,N]),$e=m.useMemo(()=>{const t=new Map;return N.forEach(a=>{const s=ae(a);if(s.length>1){const n=[...s].sort(),l=n.join("+"),i=t.get(l)||{count:0,total:0,types:n};i.count+=1,i.total+=B(a),t.set(l,i)}}),Array.from(t.entries()).map(([a,s])=>({id:a,name:a,count:s.count,total:s.total,types:s.types}))},[N]);m.useEffect(()=>{X(1)},[f,k,$,P]);const Re=async t=>{try{me(!0);let a=_.find(y=>y.bill_id===t);if((!(a!=null&&a.items)||a.items.length===0)&&(a=(await F.get(`/billing/${t}`)).data.bill),!a)throw new Error("Bill data not found");const s={bill_number:a.bill_number,customer_name:a.customer_name,customer_phone:a.customer_phone,items:a.items,subtotal:a.subtotal||a.total_amount||0,discount_percentage:a.discount_percentage,discount_amount:a.discount_amount,negotiable_amount:a.negotiable_amount||0,gst_amount:a.gst_amount||0,gst_percentage:a.gst_percentage||0,final_amount:a.final_amount||a.total_amount||0,total_amount:a.total_amount||a.subtotal||0,payment_type:a.payment_type,created_at:a.created_at,type:a.type,cgst:a.cgst||0,sgst:a.sgst||0,igst:a.igst||0,user_name:a.user_name||a.created_by_name||a.created_by||"Admin",payment_status:a.payment_status,paid_amount:a.paid_amount,balance_due:j(a)},n=c?{client_name:c.client_name,address:c.address,phone:c.phone,email:c.email,gstin:c.gstin,logo_url:c.logo_url,upi_id:c.upi_id||"",receipt_footer:c.receipt_footer||""}:{client_name:"Business Name",address:"",phone:"",email:"",gstin:"",logo_url:"",upi_id:"",receipt_footer:""},l=typeof window<"u"?window.electronAPI:null;if(l&&typeof l.silentPrint=="function")try{const{generateReceiptHtml:y,generateUpiQrDataUrl:u}=await Te(async()=>{const{generateReceiptHtml:Ge,generateUpiQrDataUrl:Oe}=await import("./webPrintService-BYGG1w3I.js");return{generateReceiptHtml:Ge,generateUpiQrDataUrl:Oe}},__vite__mapDeps([0,1,2,3,4])),x=s.type==="gst"?Number(s.final_amount):Number(s.total_amount),L=n.upi_id?await u(n.upi_id,n.client_name||"",x,s.bill_number):void 0,C=y(s,n,!0,L),pe=await l.silentPrint(C,null);if(!pe.success)throw new Error(pe.error||"Print failed")}catch(y){V.error("Print failed: "+(y.message||"Unknown error"))}else{const{printBill:y}=await Te(async()=>{const{printBill:x}=await import("./webPrintService-BYGG1w3I.js");return{printBill:x}},__vite__mapDeps([0,1,2,3,4])),u=await y(s,n,!0);if(!u.success)throw new Error(u.message||"Print failed")}}catch(a){V.error(a.message||"Print failed. Please try again.")}finally{me(!1)}},Pe=async t=>{R(t),de([]),F.get(`/billing/${t.bill_id}/payments`).then(a=>{var s;return de(((s=a.data)==null?void 0:s.payments)||[])}).catch(()=>{});try{const s=(await F.get(`/billing/${t.bill_id}`)).data.bill;R(n=>n&&n.bill_id===t.bill_id?{...n,...s}:n),E(n=>n.map(l=>l.bill_id===t.bill_id?{...l,...s}:l))}catch{}},Ie=t=>{r(`/billing/exchange/${t}`)},Me=async(t,a)=>{H({billId:t,billNumber:a})},Ue=async()=>{var s,n;if(!U)return;const{billId:t,billNumber:a}=U;H(null);try{(await F.post(`/billing/${t}/cancel`)).data.success&&E(i=>i.map(y=>y.bill_id===t?{...y,status:"cancelled"}:y))}catch(l){const i=((n=(s=l.response)==null?void 0:s.data)==null?void 0:n.error)||"Failed to cancel bill";i.includes("already cancelled")?E(y=>y.map(u=>u.bill_id===t?{...u,status:"cancelled"}:u)):V.error(i)}},j=t=>{if(t.balance_due!=null)return Number(t.balance_due);const a=Number(t.final_amount??t.total_amount??0);return t.paid_amount!=null?Math.max(a-Number(t.paid_amount),0):t.payment_status==="pending"?a:0},Ne=t=>{var a;Q(t),A(j(t).toFixed(2)),ve(((a=D[0])==null?void 0:a.payment_name)||"Cash")},He=async()=>{var a,s,n;if(!v||G)return;const t=parseFloat(oe);if(!Number.isFinite(t)||t<=0){V.warning("Enter a valid amount");return}ie(!0);try{const i=(a=(await F.post(`/billing/${v.bill_id}/payments`,{amount:t,payment_method:te})).data)==null?void 0:a.bill,y=i?{payment_status:i.payment_status,paid_amount:i.paid_amount,balance_due:i.balance_due,payment_type:i.payment_type}:{payment_status:"paid"};E(u=>u.map(x=>x.bill_id===v.bill_id?{...x,...y}:x)),(o==null?void 0:o.bill_id)===v.bill_id&&(R(u=>u&&{...u,...y}),F.get(`/billing/${v.bill_id}/payments`).then(u=>{var x;return de(((x=u.data)==null?void 0:x.payments)||[])}).catch(()=>{})),V.success((i==null?void 0:i.payment_status)==="paid"?`Bill #${v.bill_number} fully paid`:`Payment recorded — balance ${p}${Number((i==null?void 0:i.balance_due)??0).toFixed(2)}`),Q(null)}catch(l){V.error(((n=(s=l.response)==null?void 0:s.data)==null?void 0:n.error)||"Failed to record payment")}finally{ie(!1)}},je=async t=>{const a={client_name:(b==null?void 0:b.shop_name)||(c==null?void 0:c.client_name)||"Business",address:(b==null?void 0:b.address1)||(c==null?void 0:c.address)||"",address2:(b==null?void 0:b.address2)||"",phone:(b==null?void 0:b.phone)||(c==null?void 0:c.phone)||"",gstin:(b==null?void 0:b.gst_number)||(c==null?void 0:c.gstin)||"",logo_url:(c==null?void 0:c.logo_url)||"",receipt_footer:(b==null?void 0:b.receipt_footer)||""},s=t.type==="gst",n=s?t.final_amount??0:t.total_amount??0,l={bill_number:t.bill_number,customer_name:t.customer_name||"Walk-in Customer",customer_phone:t.customer_phone||"",items:(t.items||[]).map(i=>({product_id:"",product_name:i.product_name,item_code:i.item_code||"",hsn_code:"",unit:"pcs",quantity:i.quantity,rate:i.rate,mrp:i.mrp,gst_percentage:i.gst_percentage??0,gst_amount:i.quantity*i.rate*(i.gst_percentage??0)/100,amount:i.amount})),subtotal:t.subtotal??n,discount_percentage:t.discount_percentage??0,discount_amount:t.discount_amount??0,negotiable_amount:t.negotiable_amount,gst_amount:t.gst_amount??0,final_amount:t.final_amount??n,total_amount:t.total_amount??n,payment_type:t.payment_type||"[]",created_at:t.created_at,type:s?"gst":"non-gst",cgst:t.cgst??0,sgst:t.sgst??0,igst:t.igst??0,tax_breakdown:t.tax_breakdown,user_name:t.user_name||"",payment_status:t.payment_status||"paid",paid_amount:t.paid_amount,balance_due:j(t),payments:await F.get(`/billing/${t.bill_id}/payments`).then(i=>{var y;return((y=i.data)==null?void 0:y.payments)||[]}).catch(()=>[])};await wt(l,a)},Qe=t=>{const a=t.toUpperCase();return a.includes("CASH")?tt:a.includes("UPI")?gt:a.includes("CARD")?Ve:a.includes("BANK")||a.includes("NET")?Je:a.includes("WALLET")?Be:a.includes("CHEQUE")||a.includes("CHECK")?Ae:mt},Ce=t=>{const a=t.toUpperCase();return a.includes("CASH")?{bg:"from-green-500 to-green-600",text:"text-green-600",border:"border-green-500"}:a.includes("UPI")?{bg:"from-purple-500 to-purple-600",text:"text-purple-600",border:"border-purple-500"}:a.includes("CARD")?{bg:"from-blue-500 to-blue-600",text:"text-blue-600",border:"border-blue-500"}:a.includes("BANK")||a.includes("NET")?{bg:"from-indigo-500 to-indigo-600",text:"text-indigo-600",border:"border-indigo-500"}:a.includes("WALLET")?{bg:"from-orange-500 to-orange-600",text:"text-orange-600",border:"border-orange-500"}:a.includes("CHEQUE")||a.includes("CHECK")?{bg:"from-teal-500 to-teal-600",text:"text-teal-600",border:"border-teal-500"}:a.includes("PENDING")?{bg:"from-amber-500 to-amber-600",text:"text-amber-600",border:"border-amber-500"}:{bg:"from-gray-500 to-gray-600",text:"text-gray-600",border:"border-gray-500"}};return e.jsxs(et,{children:[e.jsxs("div",{className:"flex flex-col h-[calc(100vh-6rem)]",children:[e.jsx("div",{className:"flex-shrink-0 mb-2",children:e.jsxs("div",{className:"flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",children:[e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsxs("div",{children:[e.jsx("h1",{className:"text-lg font-bold text-gray-900 dark:text-white",children:"All Bills"}),e.jsx("p",{className:"text-[10px] text-gray-600 dark:text-gray-400",children:"Filter by date and payment method"})]}),e.jsxs(Ze,{to:"/billing/restore",className:"flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors",children:[e.jsx(it,{className:"w-3.5 h-3.5",strokeWidth:2}),"Cancelled Bills"]})]}),e.jsxs("div",{className:"flex flex-wrap items-center gap-1.5",children:[e.jsx("button",{type:"button",onClick:()=>{I("all"),M(""),ee("")},className:`px-2 py-1 text-[10px] font-medium rounded transition-all ${k==="all"?"bg-slate-700 text-white":"bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"}`,children:"All"}),e.jsxs("button",{type:"button",onClick:()=>{I("today"),M(""),ee("")},className:`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-all ${k==="today"?"bg-blue-600 text-white":"bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"}`,children:[e.jsx(dt,{className:"w-3 h-3"}),"Today"]}),e.jsx("div",{className:"w-px h-5 bg-gray-300 dark:bg-gray-600"}),e.jsxs("div",{className:"flex items-center gap-1",children:[e.jsx("span",{className:"text-[9px] text-gray-500 dark:text-gray-400",children:"From"}),e.jsx("input",{type:"date",value:$,max:P||q,onChange:t=>{M(t.target.value),I("custom")},className:"text-sm font-semibold text-gray-900 dark:text-white bg-transparent border border-gray-300 dark:border-gray-600 rounded px-2 py-1 cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500"})]}),e.jsxs("div",{className:"flex items-center gap-1",children:[e.jsx("span",{className:"text-[9px] text-gray-500 dark:text-gray-400",children:"To"}),e.jsx("input",{type:"date",value:P,min:$,max:q,onChange:t=>{ee(t.target.value),I("custom")},className:"text-sm font-semibold text-gray-900 dark:text-white bg-transparent border border-gray-300 dark:border-gray-600 rounded px-2 py-1 cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500"})]}),k==="custom"&&($||P)&&e.jsx("button",{type:"button",onClick:()=>{I("all"),M(""),ee("")},className:"p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300",title:"Clear dates",children:e.jsx(ue,{className:"w-3.5 h-3.5"})})]})]})}),w?e.jsxs("div",{className:"space-y-4",children:[e.jsx(at,{count:4}),e.jsx(rt,{rows:10})]}):_.length===0?e.jsx("div",{className:"flex-1 flex items-center justify-center bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow",children:e.jsxs("div",{className:"text-center",children:[e.jsx("p",{className:"text-gray-600 dark:text-gray-400 text-base",children:"No bills found"}),e.jsx("p",{className:"text-gray-500 dark:text-gray-500 text-sm mt-1",children:"Create your first bill to get started"})]})}):e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"flex-shrink-0 mb-2 overflow-x-auto scrollbar-hide",children:e.jsxs("div",{className:"flex gap-1.5 pb-1 min-w-max",children:[e.jsxs("button",{type:"button",onClick:()=>{ne("all"),Y()},className:`group flex items-center gap-1.5 px-2 py-1.5 rounded-md border transition-all duration-200 ${f==="all"?"bg-gradient-to-br from-slate-700 to-slate-600 border-slate-600 shadow-md":"bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:border-slate-400 dark:hover:border-slate-500 hover:shadow-sm"}`,children:[e.jsx("div",{className:`p-1 rounded ${f==="all"?"bg-white/20":"bg-gray-100 dark:bg-gray-700"}`,children:e.jsx(Ae,{className:`w-3 h-3 ${f==="all"?"text-white":"text-gray-600 dark:text-gray-300"}`})}),e.jsxs("div",{className:"text-left",children:[e.jsx("p",{className:`text-[9px] font-medium ${f==="all"?"text-white/80":"text-gray-500 dark:text-gray-400"}`,children:"All Bills"}),e.jsxs("div",{className:"flex items-baseline gap-1",children:[e.jsx("span",{className:`text-sm font-bold ${f==="all"?"text-white":"text-gray-900 dark:text-white"}`,children:N.length}),e.jsxs("span",{className:`text-[10px] font-medium ${f==="all"?"text-white/80":"text-gray-600 dark:text-gray-400"}`,children:[p,Le.toLocaleString("en-IN",{maximumFractionDigits:0})]})]})]})]}),Ee.map(t=>{const a=Qe(t.payment_name),s=Ce(t.payment_name),n=f===t.payment_type_id;return e.jsxs("button",{type:"button",onClick:()=>ne(t.payment_type_id),className:`group flex items-center gap-1.5 px-2 py-1.5 rounded-md border transition-all duration-200 ${n?`bg-gradient-to-br ${s.bg} border-transparent shadow-md`:`bg-white dark:bg-gray-800 ${s.border} border-opacity-30 dark:border-opacity-30 hover:border-opacity-60 hover:shadow-sm`}`,children:[e.jsx("div",{className:`p-1 rounded ${n?"bg-white/20":`bg-${s.text.split("-")[1]}-50 dark:bg-${s.text.split("-")[1]}-900/20`}`,children:e.jsx(a,{className:`w-3 h-3 ${n?"text-white":s.text}`})}),e.jsxs("div",{className:"text-left",children:[e.jsx("p",{className:`text-[9px] font-medium uppercase tracking-wide ${n?"text-white/80":`${s.text} opacity-70`}`,children:t.payment_name}),e.jsxs("div",{className:"flex items-baseline gap-1",children:[e.jsx("span",{className:`text-sm font-bold ${n?"text-white":"text-gray-900 dark:text-white"}`,children:t.count}),e.jsxs("span",{className:`text-[10px] font-medium ${n?"text-white/80":"text-gray-600 dark:text-gray-400"}`,children:[p,t.total.toLocaleString("en-IN",{maximumFractionDigits:0})]})]})]})]},t.payment_type_id)}),$e.length>0&&e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"w-px bg-gray-300 dark:bg-gray-600 mx-1 self-stretch"}),$e.map(t=>{const a=f===t.id;return e.jsxs("button",{type:"button",onClick:()=>ne(t.id),className:`group flex items-center gap-1.5 px-2 py-1.5 rounded-md border transition-all duration-200 ${a?"bg-gradient-to-br from-amber-500 to-orange-500 border-transparent shadow-md":"bg-white dark:bg-gray-800 border-amber-400 border-opacity-40 dark:border-opacity-40 hover:border-opacity-70 hover:shadow-sm"}`,children:[e.jsx("div",{className:`p-1 rounded ${a?"bg-white/20":"bg-amber-50 dark:bg-amber-900/20"}`,children:e.jsx(De,{className:`w-3 h-3 ${a?"text-white":"text-amber-600"}`})}),e.jsxs("div",{className:"text-left",children:[e.jsx("p",{className:`text-[9px] font-medium uppercase tracking-wide ${a?"text-white/80":"text-amber-600 opacity-70"}`,children:t.name}),e.jsxs("div",{className:"flex items-baseline gap-1",children:[e.jsx("span",{className:`text-sm font-bold ${a?"text-white":"text-gray-900 dark:text-white"}`,children:t.count}),e.jsxs("span",{className:`text-[10px] font-medium ${a?"text-white/80":"text-gray-600 dark:text-gray-400"}`,children:[p,t.total.toLocaleString("en-IN",{maximumFractionDigits:0})]})]})]})]},t.id)})]})]})}),e.jsx("div",{className:"hidden md:block flex-1 min-h-0 overflow-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md",children:e.jsxs("table",{className:"w-full",children:[e.jsx("thead",{className:"bg-gradient-to-r from-slate-700 to-slate-600 dark:from-gray-700 dark:to-gray-600 sticky top-0 z-10",children:e.jsxs("tr",{children:[e.jsx("th",{className:"px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase",children:"Bill #"}),e.jsx("th",{className:"px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase",children:"Date"}),e.jsx("th",{className:"px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase",children:"Customer"}),e.jsx("th",{className:"px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase",children:"Phone"}),e.jsx("th",{className:"px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase",children:"Payment Type"}),e.jsx("th",{className:"px-2 py-1.5 text-right text-[10px] font-bold text-white uppercase",children:"Amount"}),e.jsx("th",{className:"px-2 py-1.5 text-center text-[10px] font-bold text-white uppercase",children:"Actions"})]})}),e.jsx("tbody",{className:"divide-y divide-gray-200 dark:divide-gray-700",children:ge.map((t,a)=>{const s=t.displayPaymentType||"Unknown",n=Ce(s),l=t.paymentCount>1,i=t.isFirstPayment,u=new Set(se.slice(0,ke+a+1).map(x=>x.billSequenceNumber)).size;return e.jsxs("tr",{className:`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer ${!t.isFirstPayment&&l?"border-t-0":""}`,onClick:()=>t.isFirstPayment&&Pe(t),children:[e.jsx("td",{className:"px-2 py-1.5 whitespace-nowrap",children:t.isFirstPayment?e.jsxs("div",{className:"flex items-center gap-1 flex-wrap",children:[e.jsx("span",{className:`text-xs font-semibold ${t.status==="cancelled"?"text-gray-400 line-through":"text-gray-700 dark:text-gray-300"}`,children:u}),t.status==="cancelled"&&e.jsx("span",{className:"px-1.5 py-0.5 text-[8px] font-bold text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400 rounded uppercase",children:"Cancelled"}),t.payment_status==="pending"&&t.status!=="cancelled"&&e.jsx("span",{className:"px-1.5 py-0.5 text-[8px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 rounded uppercase",children:"Pending"}),t.payment_status==="partial"&&t.status!=="cancelled"&&e.jsxs("span",{className:"px-1.5 py-0.5 text-[8px] font-bold text-blue-700 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 rounded uppercase",children:["Due ",p,j(t).toLocaleString("en-IN")]})]}):e.jsx("span",{className:"text-xs text-gray-400 dark:text-gray-500 pl-2",children:"↳"})}),e.jsx("td",{className:"px-2 py-1.5 whitespace-nowrap",children:t.isFirstPayment?e.jsx("span",{className:"text-xs text-gray-600 dark:text-gray-400",children:new Date(t.created_at).toLocaleDateString("en-IN",{day:"2-digit",month:"2-digit",year:"numeric"})}):e.jsx("span",{className:"text-xs text-gray-400 dark:text-gray-500",children:"-"})}),e.jsx("td",{className:"px-2 py-1.5",children:t.isFirstPayment?e.jsx("span",{className:"text-xs text-gray-700 dark:text-gray-300",children:t.customer_name}):e.jsx("span",{className:"text-xs text-gray-400 dark:text-gray-500",children:"-"})}),e.jsx("td",{className:"px-2 py-1.5",children:t.isFirstPayment?e.jsx("span",{className:"text-xs text-gray-600 dark:text-gray-400",children:t.customer_phone}):e.jsx("span",{className:"text-xs text-gray-400 dark:text-gray-500",children:"-"})}),e.jsx("td",{className:"px-2 py-1.5 whitespace-nowrap",children:e.jsx("span",{className:`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-white bg-gradient-to-r ${n.bg} rounded-full uppercase shadow-sm`,children:s})}),e.jsx("td",{className:"px-2 py-1.5 text-right whitespace-nowrap",children:e.jsxs("span",{className:"text-xs font-bold text-gray-900 dark:text-white",children:[p,t.displayAmount.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})]})}),i?e.jsx("td",{className:"px-2 py-1.5 text-center whitespace-nowrap",rowSpan:t.paymentCount,children:e.jsxs("div",{className:"flex items-center justify-center gap-1 flex-wrap",children:[(t.payment_status==="pending"||t.payment_status==="partial")&&e.jsxs("button",{type:"button",onClick:x=>{x.stopPropagation(),Ne(t)},className:"inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 rounded transition-all border border-green-300 dark:border-green-700",title:`Receive payment (balance ${p}${j(t).toFixed(2)})`,children:[e.jsx(ye,{className:"w-3 h-3"}),"Receive"]}),e.jsxs("button",{type:"button",onClick:x=>{x.stopPropagation(),Ie(t.bill_id)},className:"inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-all",title:"Exchange Bill",children:[e.jsx(De,{className:"w-3 h-3"}),"Exchange"]}),e.jsxs("button",{type:"button",onClick:x=>{x.stopPropagation(),Re(t.bill_id)},disabled:Z,className:"inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed",title:"Print Bill",children:[e.jsx("svg",{className:"w-3 h-3",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"})}),"Print"]}),e.jsxs("button",{type:"button",onClick:x=>{x.stopPropagation(),je(t)},className:"inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 rounded transition-all",title:"Download PDF",children:[e.jsx("svg",{className:"w-3 h-3",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"})}),"PDF"]}),e.jsxs("button",{type:"button",onClick:x=>{x.stopPropagation(),Me(t.bill_id,t.bill_number)},className:"inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded transition-all",title:"Cancel Bill",children:[e.jsx(ue,{className:"w-3 h-3"}),"Cancel"]})]})}):null]},`${t.bill_id}-${t.displayPaymentType}-${a}`)})})]})}),e.jsx("div",{className:"md:hidden space-y-3",children:ge.filter(t=>t.isFirstPayment!==!1).map(t=>{var a;return e.jsxs("div",{onClick:()=>Pe(t),className:"cursor-pointer bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm active:bg-gray-50 dark:active:bg-gray-700 transition-colors",children:[e.jsxs("div",{className:"flex items-start justify-between gap-2 mb-2",children:[e.jsxs("div",{children:[e.jsxs("div",{className:"flex items-center gap-1.5",children:[e.jsxs("p",{className:"text-sm font-semibold text-gray-900 dark:text-white",children:["#",be(t)]}),t.payment_status==="pending"&&t.status!=="cancelled"&&e.jsx("span",{className:"px-1.5 py-0.5 text-[9px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 rounded uppercase",children:"Payment Pending"}),t.payment_status==="partial"&&t.status!=="cancelled"&&e.jsxs("span",{className:"px-1.5 py-0.5 text-[9px] font-bold text-blue-700 bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 rounded uppercase",children:["Due ",p,j(t).toLocaleString("en-IN")]})]}),e.jsx("p",{className:"text-xs text-gray-500 dark:text-gray-400 mt-0.5",children:t.customer_name||"Walk-in"})]}),e.jsx("span",{className:`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${t.status==="cancelled"?"bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400":"bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"}`,children:t.displayPaymentType??t.payment_type})]}),e.jsxs("div",{className:"flex items-center justify-between text-xs text-gray-500 dark:text-gray-400",children:[e.jsx("span",{children:t.created_at?new Date(t.created_at).toLocaleDateString():""}),e.jsxs("span",{className:"text-sm font-bold text-gray-900 dark:text-white",children:[p,(a=t.displayAmount)==null?void 0:a.toLocaleString()]})]}),(t.payment_status==="pending"||t.payment_status==="partial")&&t.status!=="cancelled"&&e.jsxs("div",{className:"mt-2 flex gap-2",children:[e.jsxs("button",{type:"button",onClick:s=>{s.stopPropagation(),Ne(t)},className:"flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 rounded border border-green-300 dark:border-green-700",children:[e.jsx(ye,{className:"w-3.5 h-3.5"})," Receive ",p,j(t).toFixed(0)]}),e.jsxs("button",{type:"button",onClick:s=>{s.stopPropagation(),je(t)},className:"flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 rounded",children:[e.jsx("svg",{className:"w-3.5 h-3.5",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"})}),"PDF"]})]})]},`${t.bill_id}-${t.displayPaymentType??t.payment_type}`)})}),ce>1&&e.jsxs("div",{className:"flex-shrink-0 flex items-center justify-center gap-1 mt-1.5",children:[e.jsx("button",{type:"button",onClick:()=>X(t=>Math.max(1,t-1)),disabled:K===1,className:"px-2.5 py-1 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-[10px] font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed",children:"Previous"}),e.jsx("div",{className:"flex gap-1",children:Array.from({length:ce},(t,a)=>a+1).map(t=>e.jsx("button",{type:"button",onClick:()=>X(t),className:`w-7 h-7 rounded-md text-[10px] font-bold transition-all ${K===t?"bg-gradient-to-br from-slate-700 to-slate-600 text-white shadow-md":"bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"}`,children:t},t))}),e.jsx("button",{type:"button",onClick:()=>X(t=>Math.min(ce,t+1)),disabled:K===ce,className:"px-2.5 py-1 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-[10px] font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed",children:"Next"})]}),e.jsx("div",{className:"flex-shrink-0 mt-1.5 bg-gradient-to-r from-slate-800 to-slate-700 dark:from-gray-800 dark:to-gray-700 rounded-lg border border-slate-600 dark:border-gray-600 shadow-lg px-3 py-2",children:e.jsxs("div",{className:"flex justify-between items-center",children:[e.jsxs("div",{className:"flex items-center gap-6",children:[e.jsxs("div",{children:[e.jsxs("p",{className:"text-slate-400 dark:text-gray-400 text-[10px] uppercase font-medium",children:["Page ",K," of ",ce||1]}),e.jsxs("p",{className:"text-slate-300 dark:text-gray-300 text-xs font-semibold",children:[ge.length," items"]})]}),e.jsxs("div",{className:"border-l border-slate-600 pl-6",children:[e.jsx("p",{className:"text-slate-400 dark:text-gray-400 text-[10px] uppercase font-medium",children:"Page Total"}),e.jsxs("p",{className:"text-yellow-400 text-sm font-bold",children:[p,ge.reduce((t,a)=>t+a.displayAmount,0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})]})]})]}),e.jsxs("div",{className:"text-right",children:[e.jsx("p",{className:"text-slate-400 dark:text-gray-400 text-[10px] uppercase font-medium",children:f==="all"?`Grand Total (${N.length} bills)${k!=="all"?` • ${k==="today"?"Today":"Custom"}`:""}`:`${((Se=D.find(t=>t.payment_type_id===f))==null?void 0:Se.payment_name)||f} (${new Set(se.map(t=>t.bill_id)).size} bills)`}),e.jsxs("p",{className:"text-white text-lg font-bold",children:[p,Fe.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})]})]})]})})]})]}),o&&e.jsxs("div",{className:"fixed inset-0 z-50 flex justify-end",onClick:()=>R(null),children:[e.jsx("div",{className:"absolute inset-0 bg-black/40 backdrop-blur-sm"}),e.jsxs("div",{className:"relative w-full max-w-md bg-white dark:bg-gray-900 h-full shadow-2xl overflow-y-auto flex flex-col",onClick:t=>t.stopPropagation(),children:[e.jsxs("div",{className:"flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800",children:[e.jsxs("div",{children:[e.jsxs("h2",{className:"text-base font-semibold text-gray-900 dark:text-white",children:["Bill #",be(o)]}),e.jsx("span",{className:`text-xs px-2 py-0.5 rounded-full font-medium ${o.type==="gst"?"bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300":"bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"}`,children:o.type==="gst"?"GST":"Non-GST"})]}),e.jsx("button",{type:"button",onClick:()=>R(null),className:"p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors",children:e.jsx(qe,{className:"w-5 h-5"})})]}),e.jsxs("div",{className:"px-5 py-4 grid grid-cols-2 gap-3 border-b border-gray-200 dark:border-gray-700",children:[e.jsxs("div",{className:"flex items-start gap-2",children:[e.jsx(lt,{className:"w-4 h-4 text-gray-400 mt-0.5 shrink-0"}),e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] text-gray-400 uppercase font-medium",children:"Customer"}),e.jsx("p",{className:"text-sm text-gray-800 dark:text-gray-200",children:o.customer_name||"Walk-In"}),o.customer_phone&&e.jsx("p",{className:"text-xs text-gray-500 dark:text-gray-400",children:o.customer_phone})]})]}),e.jsxs("div",{className:"flex items-start gap-2",children:[e.jsx(ct,{className:"w-4 h-4 text-gray-400 mt-0.5 shrink-0"}),e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] text-gray-400 uppercase font-medium",children:"Date"}),e.jsx("p",{className:"text-sm text-gray-800 dark:text-gray-200",children:new Date(o.created_at).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}),e.jsx("p",{className:"text-xs text-gray-500 dark:text-gray-400",children:new Date(o.created_at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})})]})]}),e.jsxs("div",{className:"flex items-start gap-2",children:[e.jsx(Be,{className:"w-4 h-4 text-gray-400 mt-0.5 shrink-0"}),e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] text-gray-400 uppercase font-medium",children:"Payment"}),e.jsx("p",{className:"text-sm text-gray-800 dark:text-gray-200",children:o.payment_type?(()=>{const t=o.payment_type;if(typeof t=="string"&&t.trim().startsWith("["))try{const a=JSON.parse(t);return Array.isArray(a)?a.map(s=>`${s.payment_type||s.PAYMENT_TYPE||""}${s.amount||s.AMOUNT?` ${p}${s.amount||s.AMOUNT}`:""}`).join(" + "):t}catch{return t}return t})():"—"})]})]}),o.status==="cancelled"&&e.jsxs("div",{className:"flex items-start gap-2",children:[e.jsx(ue,{className:"w-4 h-4 text-red-400 mt-0.5 shrink-0"}),e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] text-gray-400 uppercase font-medium",children:"Status"}),e.jsx("p",{className:"text-sm text-red-500 font-medium",children:"Cancelled"})]})]})]}),e.jsxs("div",{className:"px-5 py-4 flex-1",children:[e.jsxs("div",{className:"flex items-center gap-2 mb-3",children:[e.jsx(pt,{className:"w-4 h-4 text-gray-400"}),e.jsx("h3",{className:"text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase",children:"Items"})]}),o.items&&o.items.length>0?e.jsx("div",{className:"space-y-2",children:o.items.map((t,a)=>e.jsxs("div",{className:"flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0",children:[e.jsxs("div",{className:"flex-1 min-w-0",children:[e.jsx("p",{className:"text-sm text-gray-800 dark:text-gray-200 truncate",children:t.product_name}),e.jsxs("p",{className:"text-xs text-gray-500 dark:text-gray-400",children:[t.quantity," × ",p,(t.rate||0).toLocaleString("en-IN"),t.gst_percentage?` + ${t.gst_percentage}% ${S}`:""]})]}),e.jsxs("p",{className:"text-sm font-medium text-gray-800 dark:text-gray-200 shrink-0 ml-3",children:[p,(t.amount||0).toLocaleString("en-IN",{minimumFractionDigits:2})]})]},a))}):e.jsx("p",{className:"text-sm text-gray-400 italic",children:"No item details available"})]}),e.jsxs("div",{className:"px-5 py-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 space-y-2",children:[o.type==="gst"&&o.subtotal!==void 0&&e.jsxs("div",{className:"flex justify-between text-sm text-gray-600 dark:text-gray-400",children:[e.jsx("span",{children:"Subtotal"}),e.jsxs("span",{children:[p,(o.subtotal||0).toLocaleString("en-IN",{minimumFractionDigits:2})]})]}),o.gst_amount!==void 0&&o.gst_amount>0&&e.jsxs("div",{className:"flex justify-between text-sm text-gray-600 dark:text-gray-400",children:[e.jsxs("span",{children:[S," (",o.gst_percentage||0,"%)"]}),e.jsxs("span",{children:[p,(o.gst_amount||0).toLocaleString("en-IN",{minimumFractionDigits:2})]})]}),o.discount_amount!==void 0&&o.discount_amount>0&&e.jsxs("div",{className:"flex justify-between text-sm text-red-500",children:[e.jsxs("span",{children:["Discount ",o.discount_percentage?`(${o.discount_percentage}%)`:""]}),e.jsxs("span",{children:["-",p,(o.discount_amount||0).toLocaleString("en-IN",{minimumFractionDigits:2})]})]}),e.jsxs("div",{className:"flex justify-between text-base font-bold text-gray-900 dark:text-white pt-2 border-t border-gray-200 dark:border-gray-700",children:[e.jsx("span",{children:"Total"}),e.jsxs("span",{children:[p,((o.final_amount??o.total_amount)||0).toLocaleString("en-IN",{minimumFractionDigits:2})]})]}),j(o)>0&&o.status!=="cancelled"&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"flex justify-between text-sm text-green-700 dark:text-green-400",children:[e.jsx("span",{children:"Paid"}),e.jsxs("span",{children:[p,Number(o.paid_amount??0).toLocaleString("en-IN",{minimumFractionDigits:2})]})]}),e.jsxs("div",{className:"flex justify-between text-sm font-semibold text-red-600 dark:text-red-400",children:[e.jsx("span",{children:"Balance Due"}),e.jsxs("span",{children:[p,j(o).toLocaleString("en-IN",{minimumFractionDigits:2})]})]})]}),O.length>0&&e.jsxs("div",{className:"mt-3 p-2.5 bg-gray-50 dark:bg-gray-900/40 rounded-lg border border-gray-200 dark:border-gray-700",children:[e.jsx("p",{className:"text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-1.5",children:"Payment History"}),O.map(t=>e.jsxs("div",{className:"flex justify-between text-xs text-gray-700 dark:text-gray-300 py-0.5",children:[e.jsxs("span",{children:[t.payment_date?new Date(t.payment_date).toLocaleDateString("en-IN",{day:"2-digit",month:"short"}):"—"," · ",t.payment_method||"Cash"]}),e.jsxs("span",{className:"font-medium",children:[p,Number(t.amount).toLocaleString("en-IN",{minimumFractionDigits:2})]})]},t.payment_id))]}),(o.payment_status==="pending"||o.payment_status==="partial")&&o.status!=="cancelled"&&e.jsxs("div",{className:`mt-3 flex items-center justify-between p-2.5 rounded-lg border ${o.payment_status==="partial"?"bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700":"bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700"}`,children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("span",{className:"text-sm",children:o.payment_status==="partial"?"💰":"⏳"}),e.jsx("span",{className:`text-sm font-semibold ${o.payment_status==="partial"?"text-blue-700 dark:text-blue-400":"text-amber-700 dark:text-amber-400"}`,children:o.payment_status==="partial"?`Partially Paid — ${p}${j(o).toFixed(2)} due`:"Payment Pending"})]}),e.jsxs("button",{type:"button",onClick:()=>Ne(o),className:"inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition",children:[e.jsx(ye,{className:"w-3.5 h-3.5"}),"Receive Payment"]})]}),e.jsx("div",{className:"mt-3 flex gap-2",children:e.jsxs("button",{type:"button",onClick:()=>je(o),className:"flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 rounded-lg border border-purple-200 dark:border-purple-700 transition",children:[e.jsx("svg",{className:"w-4 h-4",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"})}),"Download PDF"]})})]})]})]}),v&&e.jsxs("div",{className:"fixed inset-0 z-[60] flex items-center justify-center",onClick:()=>!G&&Q(null),children:[e.jsx("div",{className:"absolute inset-0 bg-black/50 backdrop-blur-sm"}),e.jsxs("div",{className:"relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 border border-gray-200 dark:border-gray-700",onClick:t=>t.stopPropagation(),children:[e.jsxs("div",{className:"flex items-center gap-3 mb-4",children:[e.jsx("div",{className:"w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0",children:e.jsx(ye,{className:"w-5 h-5 text-green-600 dark:text-green-400"})}),e.jsxs("div",{children:[e.jsxs("h3",{className:"text-base font-semibold text-gray-900 dark:text-white",children:["Receive Payment — Bill #",v.bill_number]}),e.jsxs("p",{className:"text-xs text-gray-500 dark:text-gray-400 mt-0.5",children:["Balance due: ",p,j(v).toLocaleString("en-IN",{minimumFractionDigits:2})]})]})]}),e.jsx("label",{className:"block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1",children:"Amount received now"}),e.jsx("input",{type:"number",min:"0.01",step:"0.01",max:j(v),value:oe,onChange:t=>A(t.target.value),autoFocus:!0,className:"w-full px-3 py-2 mb-3 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500 focus:border-green-500"}),e.jsx("p",{className:"-mt-2 mb-3 text-[11px] text-gray-400 dark:text-gray-500",children:"A smaller amount records another instalment; the full balance settles the bill."}),e.jsx("label",{className:"block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1",children:"Payment method"}),e.jsx("select",{value:te,onChange:t=>ve(t.target.value),className:"w-full px-3 py-2 mb-4 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-green-500",children:(D.length>0?D.map(t=>t.payment_name):["Cash","Card","UPI"]).map(t=>e.jsx("option",{value:t,children:t},t))}),e.jsxs("div",{className:"flex gap-2",children:[e.jsx("button",{type:"button",disabled:G,onClick:()=>Q(null),className:"flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition disabled:opacity-50",children:"Cancel"}),e.jsx("button",{type:"button",disabled:G,onClick:He,className:"flex-1 px-4 py-2.5 text-sm font-bold text-white bg-green-600 rounded-lg hover:bg-green-700 transition disabled:opacity-60",children:G?"Recording…":"Record Payment"})]})]})]}),U&&e.jsxs("div",{className:"fixed inset-0 z-[60] flex items-center justify-center",onClick:()=>H(null),children:[e.jsx("div",{className:"absolute inset-0 bg-black/50 backdrop-blur-sm"}),e.jsxs("div",{className:"relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 border border-gray-200 dark:border-gray-700",onClick:t=>t.stopPropagation(),children:[e.jsxs("div",{className:"flex items-center gap-3 mb-4",children:[e.jsx("div",{className:"w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0",children:e.jsx(ue,{className:"w-5 h-5 text-red-600 dark:text-red-400"})}),e.jsxs("div",{children:[e.jsxs("h3",{className:"text-base font-semibold text-gray-900 dark:text-white",children:["Cancel Bill #",U.billNumber,"?"]}),e.jsx("p",{className:"text-xs text-gray-500 dark:text-gray-400 mt-0.5",children:"This will restore all item quantities to stock."})]})]}),e.jsxs("div",{className:"flex gap-2 mt-5",children:[e.jsx("button",{type:"button",onClick:()=>H(null),className:"flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition",children:"No, Keep Bill"}),e.jsx("button",{type:"button",onClick:Ue,className:"flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition",children:"Yes, Cancel Bill"})]})]})]})]})}export{Ot as default};
