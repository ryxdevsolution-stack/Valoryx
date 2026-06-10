const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/webPrintService-CVmhLuO5.js","assets/vendor-Bq8eTzyd.js"])))=>i.map(i=>d[i]);
import{c as ve,t as J,u as Ae,a as K,j as e,b as re,R as he,d as pe,X as ze,_ as ye,e as Be,B as Le}from"./index-CIMMUQ6y.js";import{u as Ee,d as Fe,r as p,L as Me}from"./vendor-Bq8eTzyd.js";import{D as Re,B as Ie}from"./DashboardLayout-C5W46PlR.js";import{C as Ue,T as He}from"./SkeletonLoader-NlenDVim.js";import{g as Qe}from"./shopSettingsService-DfbhzwwO.js";import{R as Ge}from"./rotate-ccw-Ba5Wm_T3.js";import{C as We}from"./calendar-tZVM1R0g.js";import{F as be}from"./file-text-BBBbxxqH.js";import{U as Oe}from"./user-C17I_BLU.js";import{C as Ye}from"./clock-B_h0owpd.js";import{P as qe}from"./package-Bv52MKo9.js";import{D as Ve}from"./dollar-sign-BpcGSgIT.js";import"./search-CScEx_13.js";import"./loader-circle-7-c02zdS.js";import"./trending-up-Bycf2KoL.js";import"./truck-D-Qw8_bI.js";import"./chevron-right-BswGBGtq.js";import"./menu-FlfMs7DR.js";import"./zap-DnGUlPjt.js";import"./triangle-alert-D1eA594I.js";/**
 * @license lucide-react v0.548.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Ke=[["rect",{width:"14",height:"20",x:"5",y:"2",rx:"2",ry:"2",key:"1yt0o3"}],["path",{d:"M12 18h.01",key:"mhygvu"}]],Je=ve("smartphone",Ke);/**
 * @license lucide-react v0.548.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const Xe=[["path",{d:"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1",key:"18etb6"}],["path",{d:"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4",key:"xoc0q4"}]],fe=ve("wallet",Xe);function C(n){return"₹"+n.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})}function Ze(n){const c=new Date(n),d=c.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}),f=c.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",hour12:!0});return`${d} | ${f}`}function et(n){try{const c=JSON.parse(n);if(Array.isArray(c))return c.map(d=>d.payment_name||d.payment_type||"Cash").join(" + ")}catch{}return n||"Cash"}function tt(n){return!n||n.length<4?n:"••••••"+n.slice(-4)}function y(n){return n?n.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"):""}async function at(n){try{const c=await fetch(n,{mode:"cors"});if(!c.ok)return null;const d=await c.blob();return await new Promise((f,j)=>{const P=new FileReader;P.onloadend=()=>f(P.result),P.onerror=j,P.readAsDataURL(d)})}catch{return null}}async function rt(n,c){var D;const d=n.type==="gst",f=d?n.final_amount:n.total_amount,j=n.payment_status==="pending",P=et(n.payment_type);let Q=null;c.logo_url&&(Q=await at(c.logo_url));const se=y(c.client_name.charAt(0).toUpperCase()),X=Q?`<img src="${Q}" alt="Logo" class="logo-img" />`:`<div class="logo-letter">${se}</div>`,G=[c.address,c.address2].filter(Boolean).map(y).join(", "),$=[],T=[];c.gstin&&$.push(`<div class="biz-row"><span class="biz-lbl">GSTIN</span><span class="biz-val">${y(c.gstin)}</span></div>`),T.push(`<div class="biz-row"><span class="biz-lbl">Legal Name</span><span class="biz-val">${y(c.client_name)}</span></div>`),c.phone&&$.push(`<div class="biz-row"><span class="biz-lbl">Phone</span><span class="biz-val">${y(c.phone)}</span></div>`),c.email&&T.push(`<div class="biz-row"><span class="biz-lbl">Email</span><span class="biz-val">${y(c.email)}</span></div>`),n.customer_gstin&&$.push(`<div class="biz-row"><span class="biz-lbl">Cust. GSTIN</span><span class="biz-val">${y(n.customer_gstin)}</span></div>`),T.push(`<div class="biz-row"><span class="biz-lbl">Bill Type</span><span class="biz-val">${d?"GST Invoice":"Invoice"}</span></div>`);const W=`
    <div class="biz-grid">
      <div class="biz-col">${$.join("")}</div>
      <div class="biz-col">${T.join("")}</div>
    </div>`,Z=n.customer_name&&n.customer_name!=="Walk-in Customer"?y(n.customer_name.split(" ")[0]):null,ee=Z?`Hi ${Z}, here's your bill!`:"Here's your bill!",i=n.customer_phone?tt(n.customer_phone):null,z=d?'<th class="tc gst-th">GST %</th>':"",v=n.items.some(b=>Number(b.discount_percentage||0)>0),B=v?'<th class="tc">Disc %</th>':"",N=n.items.map((b,oe)=>{const U=d?`<td class="tc muted">${b.gst_percentage}%</td>`:"",R=Number(b.discount_percentage||0),_=v?`<td class="tc muted">${R>0?`${R}%`:"−"}</td>`:"";return`
      <tr class="${oe%2===0?"":"row-alt"}">
        <td class="item-td">
          <span class="item-name">${y(b.product_name)}</span>
          ${b.item_code?`<span class="item-code">${y(b.item_code)}</span>`:""}
        </td>
        <td class="tc">${b.quantity}</td>
        <td class="tr">${C(b.rate)}</td>
        ${_}
        ${U}
        <td class="tr fw">${C(b.amount)}</td>
      </tr>`}).join(""),L=n.discount_amount||0,w=n.negotiable_amount||0,k=[];if(k.push(`<tr><td class="tot-lbl">Subtotal</td><td class="tot-val">${C(n.subtotal||f)}</td></tr>`),L>0){const b=n.discount_percentage?`Discount (${n.discount_percentage}%)`:"Discount";k.push(`<tr><td class="tot-lbl">${b}</td><td class="tot-val green">− ${C(L)}</td></tr>`)}else w>0&&k.push(`<tr><td class="tot-lbl">Negotiated</td><td class="tot-val green">− ${C(w)}</td></tr>`);const E=Number(n.membership_redeemed)||0;if(E>0){const b=(D=n.membership)!=null&&D.points_redeemed?`Points Redeemed (${n.membership.points_redeemed} pts)`:"Points Redeemed";k.push(`<tr><td class="tot-lbl">${b}</td><td class="tot-val green">− ${C(E)}</td></tr>`)}d&&(k.push(`<tr><td class="tot-lbl">CGST</td><td class="tot-val">${C(n.cgst)}</td></tr>`),k.push(`<tr><td class="tot-lbl">SGST</td><td class="tot-val">${C(n.sgst)}</td></tr>`));const F=c.receipt_footer?`<p class="footer-note">${y(c.receipt_footer)}</p>`:"",m=n.membership,ne=m?`<div class="points-panel">
         <div class="confetti-bg">
           <div class="points-inner">
             <div class="points-label">Member ${y(m.card_number||"")}</div>
             <div class="points-value">+${m.points_earned} Points</div>
             <div class="points-sub">Balance: ${m.points_balance} pts &middot; T&amp;C applied</div>
           </div>
         </div>
       </div>`:n.points_earned&&n.points_earned>0?`<div class="points-panel">
           <div class="confetti-bg">
             <div class="points-inner">
               <div class="points-label">You have earned</div>
               <div class="points-value">${n.points_earned.toFixed(2)} Points</div>
               <div class="points-sub">T&amp;C applied</div>
             </div>
           </div>
         </div>`:"",M=j?'<div class="pending-banner">⏳ &nbsp;PAYMENT PENDING — NOT YET COLLECTED</div>':"",te=`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Invoice #${n.bill_number} — ${y(c.client_name)}</title>
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
    <div class="logo-circle">${X}</div>
    <div class="location-block">
      <div class="location-line">
        <span class="location-pin">📍</span>
        <span>${G}</span>
      </div>
      <span class="view-store">${y(c.client_name)}</span>
    </div>
  </div>

  <!-- Brand accent bar -->
  <div class="brand-bar"></div>

  ${M}

  <!-- Business info 2-col -->
  <div class="biz-section">${W}</div>

  <hr class="dash"/>

  <!-- Greeting -->
  <div class="greeting-row">
    <span class="greeting-text">${ee}</span>
    <span class="dl-icon">⬇</span>
  </div>

  <hr class="dash"/>

  <!-- Amount hero -->
  <div class="amount-hero">
    <div class="amount-row-top">
      <div>
        <div class="amount-main">
          ${C(f)}
          <span class="${j?"status-chip chip-pending":"status-chip chip-paid"}">${j?"Pending":"Paid"}</span>
        </div>
        <div class="amount-payment">${y(P)}</div>
      </div>
      <div class="amount-meta">
        <div class="meta-date">${Ze(n.created_at)}</div>
        <div class="meta-items">${n.items.length} item${n.items.length!==1?"s":""}</div>
      </div>
    </div>
  </div>

  <!-- Bill # + masked phone row -->
  <div class="bill-meta-row">
    <span class="meta-pill">Bill <strong>#${n.bill_number}</strong></span>
    ${i?`<span class="meta-pill">Mobile <strong>${y(i)}</strong></span>`:`<span class="cashier-note">Cashier: ${y(n.user_name||"Admin")}</span>`}
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
          ${B}
          ${z}
          <th class="tr">Amt</th>
        </tr>
      </thead>
      <tbody>${N}</tbody>
    </table>
  </div>

  <hr class="dash" style="margin-top:8px"/>

  <!-- Totals -->
  <div class="totals-section">
    <table class="tot-tbl">
      ${k.join("")}
      <tr class="grand-row">
        <td class="grand-lbl">Grand Total</td>
        <td class="grand-val">${C(f)}</td>
      </tr>
    </table>
  </div>

  <!-- Footer note -->
  ${F?`<div class="card-footer">${F}</div>`:""}

  <!-- Wavy bottom SVG — colour matches page background (#ebebeb) -->
  <div class="wave-wrap">
    <svg viewBox="0 0 500 28" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M0,0 Q12.5,28 25,0 Q37.5,28 50,0 Q62.5,28 75,0 Q87.5,28 100,0 Q112.5,28 125,0 Q137.5,28 150,0 Q162.5,28 175,0 Q187.5,28 200,0 Q212.5,28 225,0 Q237.5,28 250,0 Q262.5,28 275,0 Q287.5,28 300,0 Q312.5,28 325,0 Q337.5,28 350,0 Q362.5,28 375,0 Q387.5,28 400,0 Q412.5,28 425,0 Q437.5,28 450,0 Q462.5,28 475,0 Q487.5,28 500,0 L500,28 L0,28 Z" fill="#ebebeb"/>
    </svg>
  </div>

</div>
<!-- ═══ END CARD ═════════════════════════════════════════ -->

<!-- Loyalty points panel (festive, below card) -->
${ne}

<!-- Powered by -->
<div class="powered-row">Powered by <strong>Valoryx</strong></div>

<!-- Action buttons -->
<div class="actions">
  <button class="btn btn-secondary" onclick="window.close()">Close</button>
  <button class="btn btn-primary" onclick="window.print()">Save as PDF / Print</button>
</div>

</body>
</html>`,O=new Blob([te],{type:"text/html;charset=utf-8"}),I=URL.createObjectURL(O);window.open(I,"_blank","width=580,height=900,scrollbars=yes")||J.error("Popup blocked — please allow popups for this site to generate PDFs."),setTimeout(()=>URL.revokeObjectURL(I),3e4)}function jt(){var ue;const n=Ee(),c=Fe(),{client:d}=Ae(),[f,j]=p.useState([]),[P,Q]=p.useState([]),[se,X]=p.useState(!0),[h,G]=p.useState("all"),[$,T]=p.useState(1),W=17,[Z,ee]=p.useState(!1),[i,z]=p.useState(null),[v,B]=p.useState("all"),[N,L]=p.useState(""),[w,k]=p.useState(""),[E,F]=p.useState(null),[m,ne]=p.useState(null),M=p.useRef(null),te=p.useRef(!0);p.useEffect(()=>{Y(),Qe().then(ne).catch(()=>{})},[]),p.useEffect(()=>{if(te.current){te.current=!1;return}M.current=null,Y()},[c.key]),p.useEffect(()=>{const t=c.state;t!=null&&t.refreshAfterExchange&&(n(c.pathname,{replace:!0,state:{}}),M.current=null,Y())},[c.state]);const O=p.useMemo(()=>{const t=new Map;return f.forEach(a=>{if(!a.payment_type){t.set(a.bill_id,[]);return}const r=String(a.payment_type).trim();if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r)){t.set(a.bill_id,[]);return}if(r.startsWith("["))try{const s=JSON.parse(r);if(Array.isArray(s)){t.set(a.bill_id,s.map(o=>o.PAYMENT_TYPE||o.payment_type||o.payment_name).filter(Boolean));return}}catch{}t.set(a.bill_id,[r])}),t},[f]),I=t=>O.get(t.bill_id)??[],Y=async()=>{M.current=null;const t=(async()=>{try{X(!0);const r=(await K.get("/billing/list?limit=100&status=final")).data.bills||[];if(j(r),r.length>0){const s=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,o=new Set;r.forEach(u=>{if(!u.payment_type)return;const x=String(u.payment_type).trim();if(!s.test(x)){if(x.startsWith("["))try{const A=JSON.parse(x);if(Array.isArray(A)){A.forEach(S=>{const V=S.PAYMENT_TYPE||S.payment_type||S.payment_name;V&&o.add(V)});return}}catch{}o.add(x)}});const l=["CASH","UPI","CARD","CREDIT CARD","NET BANKING","CHEQUE","CREDIT","WALLET"],g=Array.from(o).sort((u,x)=>{const A=l.indexOf(u.toUpperCase()),S=l.indexOf(x.toUpperCase());return A!==-1&&S!==-1?A-S:A!==-1?-1:S!==-1?1:u.localeCompare(x)});Q(g.map(u=>({payment_type_id:u,payment_name:u})))}}catch{}finally{X(!1),M.current=null}})();return M.current=t,t},D=t=>t.status==="cancelled"?0:t.type==="gst"?parseFloat(String(t.final_amount||"0")):parseFloat(String(t.total_amount||"0")),b=(t,a)=>{const r=D(t);if(typeof t.payment_type=="string"&&t.payment_type.trim().startsWith("["))try{const s=JSON.parse(t.payment_type);if(Array.isArray(s)){const o=s.find(l=>(l.PAYMENT_TYPE||l.payment_type)===a);if(o)return parseFloat(String(o.AMOUNT||o.amount||0))}}catch{return t.payment_type===a?r:0}return t.payment_type===a?r:0},oe=t=>{const a=[];let r=0;return t.forEach(s=>{const o=I(s);r++,o.length>1?o.forEach((l,g)=>{a.push({...s,displayPaymentType:l,displayAmount:b(s,l),isFirstPayment:g===0,paymentCount:o.length,billSequenceNumber:r})}):a.push({...s,displayPaymentType:o[0]||s.payment_type,displayAmount:D(s),isFirstPayment:!0,paymentCount:1,billSequenceNumber:r})}),a},U=p.useCallback(t=>{const a=t.getFullYear(),r=String(t.getMonth()+1).padStart(2,"0"),s=String(t.getDate()).padStart(2,"0");return`${a}-${r}-${s}`},[]),R=p.useMemo(()=>U(new Date),[U]),_=p.useMemo(()=>f.filter(t=>{if(v==="all")return!0;const a=U(new Date(t.created_at));return v==="today"?a===R:N&&w?a>=N&&a<=w:N?a>=N:w?a<=w:!0}),[f,v,N,w,R,U]),ie=p.useMemo(()=>oe(_),[_]),H=p.useMemo(()=>h==="all"?ie:ie.filter(t=>{const a=O.get(t.bill_id)??[],r=a.length===1&&a[0].includes("+")?a[0].split("+"):a;return h.includes("+")?r.length<=1?!1:[...r].sort().join("+")===h:r.length===1&&t.displayPaymentType===h}),[ie,h,O]),q=Math.ceil(H.length/W),de=($-1)*W,we=de+W,ae=H.slice(de,we),ke=p.useMemo(()=>_.reduce((t,a)=>t+D(a),0),[_]),_e=p.useMemo(()=>H.reduce((t,a)=>t+a.displayAmount,0),[H]),je=p.useMemo(()=>P.map(t=>{let a=0,r=0;return _.forEach(s=>{const o=I(s);o.length===1&&o[0]===t.payment_type_id&&(a+=1,r+=D(s))}),{...t,count:a,total:r}}),[P,_]),me=p.useMemo(()=>{const t=new Map;return _.forEach(a=>{const r=I(a);if(r.length>1){const s=[...r].sort(),o=s.join("+"),l=t.get(o)||{count:0,total:0,types:s};l.count+=1,l.total+=D(a),t.set(o,l)}}),Array.from(t.entries()).map(([a,r])=>({id:a,name:a,count:r.count,total:r.total,types:r.types}))},[_]);p.useEffect(()=>{T(1)},[h,v,N,w]);const Ne=async t=>{try{ee(!0);let a=f.find(g=>g.bill_id===t);if((!(a!=null&&a.items)||a.items.length===0)&&(a=(await K.get(`/billing/${t}`)).data.bill),!a)throw new Error("Bill data not found");const r={bill_number:a.bill_number,customer_name:a.customer_name,customer_phone:a.customer_phone,items:a.items,subtotal:a.subtotal||a.total_amount||0,discount_percentage:a.discount_percentage,discount_amount:a.discount_amount,negotiable_amount:a.negotiable_amount||0,gst_amount:a.gst_amount||0,gst_percentage:a.gst_percentage||0,final_amount:a.final_amount||a.total_amount||0,total_amount:a.total_amount||a.subtotal||0,payment_type:a.payment_type,created_at:a.created_at,type:a.type,cgst:a.cgst||0,sgst:a.sgst||0,igst:a.igst||0,user_name:a.user_name||a.created_by_name||a.created_by||"Admin"},s=d?{client_name:d.client_name,address:d.address,phone:d.phone,email:d.email,gstin:d.gstin,logo_url:d.logo_url,upi_id:d.upi_id||"",receipt_footer:d.receipt_footer||""}:{client_name:"Business Name",address:"",phone:"",email:"",gstin:"",logo_url:"",upi_id:"",receipt_footer:""},o=typeof window<"u"?window.electronAPI:null;if(o&&typeof o.silentPrint=="function")try{const{generateReceiptHtml:g,generateUpiQrDataUrl:u}=await ye(async()=>{const{generateReceiptHtml:Se,generateUpiQrDataUrl:De}=await import("./webPrintService-CVmhLuO5.js");return{generateReceiptHtml:Se,generateUpiQrDataUrl:De}},__vite__mapDeps([0,1])),x=r.type==="gst"?Number(r.final_amount):Number(r.total_amount),A=s.upi_id?await u(s.upi_id,s.client_name||"",x,r.bill_number):void 0,S=g(r,s,!0,A),V=await o.silentPrint(S,null);if(!V.success)throw new Error(V.error||"Print failed")}catch(g){J.error("Print failed: "+(g.message||"Unknown error"))}else{const{printBill:g}=await ye(async()=>{const{printBill:x}=await import("./webPrintService-CVmhLuO5.js");return{printBill:x}},__vite__mapDeps([0,1])),u=await g(r,s,!0);if(!u.success)throw new Error(u.message||"Print failed")}}catch(a){J.error(a.message||"Print failed. Please try again.")}finally{ee(!1)}},xe=async t=>{z(t);try{const r=(await K.get(`/billing/${t.bill_id}`)).data.bill;z(s=>s&&s.bill_id===t.bill_id?{...s,...r}:s),j(s=>s.map(o=>o.bill_id===t.bill_id?{...o,...r}:o))}catch{}},Pe=t=>{n(`/billing/exchange/${t}`)},$e=async(t,a)=>{F({billId:t,billNumber:a})},Ce=async()=>{var r,s;if(!E)return;const{billId:t,billNumber:a}=E;F(null);try{(await K.post(`/billing/${t}/cancel`)).data.success&&j(l=>l.map(g=>g.bill_id===t?{...g,status:"cancelled"}:g))}catch(o){const l=((s=(r=o.response)==null?void 0:r.data)==null?void 0:s.error)||"Failed to cancel bill";l.includes("already cancelled")?j(g=>g.map(u=>u.bill_id===t?{...u,status:"cancelled"}:u)):J.error(l)}},le=async(t,a)=>{var r,s;if(window.confirm(`Mark Bill #${a} as Paid?`))try{await K.put(`/billing/${t}/mark-paid`),j(o=>o.map(l=>l.bill_id===t?{...l,payment_status:"paid"}:l)),(i==null?void 0:i.bill_id)===t&&z(o=>o&&{...o,payment_status:"paid"})}catch(o){J.error(((s=(r=o.response)==null?void 0:r.data)==null?void 0:s.error)||"Failed to mark as paid")}},ce=async t=>{const a={client_name:(m==null?void 0:m.shop_name)||(d==null?void 0:d.client_name)||"Business",address:(m==null?void 0:m.address1)||(d==null?void 0:d.address)||"",address2:(m==null?void 0:m.address2)||"",phone:(m==null?void 0:m.phone)||(d==null?void 0:d.phone)||"",gstin:(m==null?void 0:m.gst_number)||(d==null?void 0:d.gstin)||"",logo_url:(d==null?void 0:d.logo_url)||"",receipt_footer:(m==null?void 0:m.receipt_footer)||""},r=t.type==="gst",s=r?t.final_amount??0:t.total_amount??0,o={bill_number:t.bill_number,customer_name:t.customer_name||"Walk-in Customer",customer_phone:t.customer_phone||"",items:(t.items||[]).map(l=>({product_id:"",product_name:l.product_name,item_code:l.item_code||"",hsn_code:"",unit:"pcs",quantity:l.quantity,rate:l.rate,mrp:l.mrp,gst_percentage:l.gst_percentage??0,gst_amount:l.quantity*l.rate*(l.gst_percentage??0)/100,amount:l.amount})),subtotal:t.subtotal??s,discount_percentage:t.discount_percentage??0,discount_amount:t.discount_amount??0,negotiable_amount:t.negotiable_amount,gst_amount:t.gst_amount??0,final_amount:t.final_amount??s,total_amount:t.total_amount??s,payment_type:t.payment_type||"[]",created_at:t.created_at,type:r?"gst":"non-gst",cgst:t.cgst??0,sgst:t.sgst??0,igst:t.igst??0,user_name:t.user_name||"",payment_status:t.payment_status||"paid"};await rt(o,a)},Te=t=>{const a=t.toUpperCase();return a.includes("CASH")?Ie:a.includes("UPI")?Je:a.includes("CARD")?Be:a.includes("BANK")||a.includes("NET")?Le:a.includes("WALLET")?fe:a.includes("CHEQUE")||a.includes("CHECK")?be:Ve},ge=t=>{const a=t.toUpperCase();return a.includes("CASH")?{bg:"from-green-500 to-green-600",text:"text-green-600",border:"border-green-500"}:a.includes("UPI")?{bg:"from-purple-500 to-purple-600",text:"text-purple-600",border:"border-purple-500"}:a.includes("CARD")?{bg:"from-blue-500 to-blue-600",text:"text-blue-600",border:"border-blue-500"}:a.includes("BANK")||a.includes("NET")?{bg:"from-indigo-500 to-indigo-600",text:"text-indigo-600",border:"border-indigo-500"}:a.includes("WALLET")?{bg:"from-orange-500 to-orange-600",text:"text-orange-600",border:"border-orange-500"}:a.includes("CHEQUE")||a.includes("CHECK")?{bg:"from-teal-500 to-teal-600",text:"text-teal-600",border:"border-teal-500"}:a.includes("PENDING")?{bg:"from-amber-500 to-amber-600",text:"text-amber-600",border:"border-amber-500"}:{bg:"from-gray-500 to-gray-600",text:"text-gray-600",border:"border-gray-500"}};return e.jsxs(Re,{children:[e.jsxs("div",{className:"flex flex-col h-[calc(100vh-6rem)]",children:[e.jsx("div",{className:"flex-shrink-0 mb-2",children:e.jsxs("div",{className:"flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",children:[e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsxs("div",{children:[e.jsx("h1",{className:"text-lg font-bold text-gray-900 dark:text-white",children:"All Bills"}),e.jsx("p",{className:"text-[10px] text-gray-600 dark:text-gray-400",children:"Filter by date and payment method"})]}),e.jsxs(Me,{to:"/billing/restore",className:"flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors",children:[e.jsx(Ge,{className:"w-3.5 h-3.5",strokeWidth:2}),"Cancelled Bills"]})]}),e.jsxs("div",{className:"flex flex-wrap items-center gap-1.5",children:[e.jsx("button",{type:"button",onClick:()=>{B("all"),L(""),k("")},className:`px-2 py-1 text-[10px] font-medium rounded transition-all ${v==="all"?"bg-slate-700 text-white":"bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"}`,children:"All"}),e.jsxs("button",{type:"button",onClick:()=>{B("today"),L(""),k("")},className:`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-all ${v==="today"?"bg-blue-600 text-white":"bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"}`,children:[e.jsx(We,{className:"w-3 h-3"}),"Today"]}),e.jsx("div",{className:"w-px h-5 bg-gray-300 dark:bg-gray-600"}),e.jsxs("div",{className:"flex items-center gap-1",children:[e.jsx("span",{className:"text-[9px] text-gray-500 dark:text-gray-400",children:"From"}),e.jsx("input",{type:"date",value:N,max:w||R,onChange:t=>{L(t.target.value),B("custom")},className:"text-sm font-semibold text-gray-900 dark:text-white bg-transparent border border-gray-300 dark:border-gray-600 rounded px-2 py-1 cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500"})]}),e.jsxs("div",{className:"flex items-center gap-1",children:[e.jsx("span",{className:"text-[9px] text-gray-500 dark:text-gray-400",children:"To"}),e.jsx("input",{type:"date",value:w,min:N,max:R,onChange:t=>{k(t.target.value),B("custom")},className:"text-sm font-semibold text-gray-900 dark:text-white bg-transparent border border-gray-300 dark:border-gray-600 rounded px-2 py-1 cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500"})]}),v==="custom"&&(N||w)&&e.jsx("button",{type:"button",onClick:()=>{B("all"),L(""),k("")},className:"p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300",title:"Clear dates",children:e.jsx(re,{className:"w-3.5 h-3.5"})})]})]})}),se?e.jsxs("div",{className:"space-y-4",children:[e.jsx(Ue,{count:4}),e.jsx(He,{rows:10})]}):f.length===0?e.jsx("div",{className:"flex-1 flex items-center justify-center bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow",children:e.jsxs("div",{className:"text-center",children:[e.jsx("p",{className:"text-gray-600 dark:text-gray-400 text-base",children:"No bills found"}),e.jsx("p",{className:"text-gray-500 dark:text-gray-500 text-sm mt-1",children:"Create your first bill to get started"})]})}):e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"flex-shrink-0 mb-2 overflow-x-auto scrollbar-hide",children:e.jsxs("div",{className:"flex gap-1.5 pb-1 min-w-max",children:[e.jsxs("button",{type:"button",onClick:()=>{G("all"),Y()},className:`group flex items-center gap-1.5 px-2 py-1.5 rounded-md border transition-all duration-200 ${h==="all"?"bg-gradient-to-br from-slate-700 to-slate-600 border-slate-600 shadow-md":"bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:border-slate-400 dark:hover:border-slate-500 hover:shadow-sm"}`,children:[e.jsx("div",{className:`p-1 rounded ${h==="all"?"bg-white/20":"bg-gray-100 dark:bg-gray-700"}`,children:e.jsx(be,{className:`w-3 h-3 ${h==="all"?"text-white":"text-gray-600 dark:text-gray-300"}`})}),e.jsxs("div",{className:"text-left",children:[e.jsx("p",{className:`text-[9px] font-medium ${h==="all"?"text-white/80":"text-gray-500 dark:text-gray-400"}`,children:"All Bills"}),e.jsxs("div",{className:"flex items-baseline gap-1",children:[e.jsx("span",{className:`text-sm font-bold ${h==="all"?"text-white":"text-gray-900 dark:text-white"}`,children:_.length}),e.jsxs("span",{className:`text-[10px] font-medium ${h==="all"?"text-white/80":"text-gray-600 dark:text-gray-400"}`,children:["₹",ke.toLocaleString("en-IN",{maximumFractionDigits:0})]})]})]})]}),je.map(t=>{const a=Te(t.payment_name),r=ge(t.payment_name),s=h===t.payment_type_id;return e.jsxs("button",{type:"button",onClick:()=>G(t.payment_type_id),className:`group flex items-center gap-1.5 px-2 py-1.5 rounded-md border transition-all duration-200 ${s?`bg-gradient-to-br ${r.bg} border-transparent shadow-md`:`bg-white dark:bg-gray-800 ${r.border} border-opacity-30 dark:border-opacity-30 hover:border-opacity-60 hover:shadow-sm`}`,children:[e.jsx("div",{className:`p-1 rounded ${s?"bg-white/20":`bg-${r.text.split("-")[1]}-50 dark:bg-${r.text.split("-")[1]}-900/20`}`,children:e.jsx(a,{className:`w-3 h-3 ${s?"text-white":r.text}`})}),e.jsxs("div",{className:"text-left",children:[e.jsx("p",{className:`text-[9px] font-medium uppercase tracking-wide ${s?"text-white/80":`${r.text} opacity-70`}`,children:t.payment_name}),e.jsxs("div",{className:"flex items-baseline gap-1",children:[e.jsx("span",{className:`text-sm font-bold ${s?"text-white":"text-gray-900 dark:text-white"}`,children:t.count}),e.jsxs("span",{className:`text-[10px] font-medium ${s?"text-white/80":"text-gray-600 dark:text-gray-400"}`,children:["₹",t.total.toLocaleString("en-IN",{maximumFractionDigits:0})]})]})]})]},t.payment_type_id)}),me.length>0&&e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"w-px bg-gray-300 dark:bg-gray-600 mx-1 self-stretch"}),me.map(t=>{const a=h===t.id;return e.jsxs("button",{type:"button",onClick:()=>G(t.id),className:`group flex items-center gap-1.5 px-2 py-1.5 rounded-md border transition-all duration-200 ${a?"bg-gradient-to-br from-amber-500 to-orange-500 border-transparent shadow-md":"bg-white dark:bg-gray-800 border-amber-400 border-opacity-40 dark:border-opacity-40 hover:border-opacity-70 hover:shadow-sm"}`,children:[e.jsx("div",{className:`p-1 rounded ${a?"bg-white/20":"bg-amber-50 dark:bg-amber-900/20"}`,children:e.jsx(he,{className:`w-3 h-3 ${a?"text-white":"text-amber-600"}`})}),e.jsxs("div",{className:"text-left",children:[e.jsx("p",{className:`text-[9px] font-medium uppercase tracking-wide ${a?"text-white/80":"text-amber-600 opacity-70"}`,children:t.name}),e.jsxs("div",{className:"flex items-baseline gap-1",children:[e.jsx("span",{className:`text-sm font-bold ${a?"text-white":"text-gray-900 dark:text-white"}`,children:t.count}),e.jsxs("span",{className:`text-[10px] font-medium ${a?"text-white/80":"text-gray-600 dark:text-gray-400"}`,children:["₹",t.total.toLocaleString("en-IN",{maximumFractionDigits:0})]})]})]})]},t.id)})]})]})}),e.jsx("div",{className:"hidden md:block flex-1 min-h-0 overflow-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md",children:e.jsxs("table",{className:"w-full",children:[e.jsx("thead",{className:"bg-gradient-to-r from-slate-700 to-slate-600 dark:from-gray-700 dark:to-gray-600 sticky top-0 z-10",children:e.jsxs("tr",{children:[e.jsx("th",{className:"px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase",children:"Bill #"}),e.jsx("th",{className:"px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase",children:"Date"}),e.jsx("th",{className:"px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase",children:"Customer"}),e.jsx("th",{className:"px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase",children:"Phone"}),e.jsx("th",{className:"px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase",children:"Payment Type"}),e.jsx("th",{className:"px-2 py-1.5 text-right text-[10px] font-bold text-white uppercase",children:"Amount"}),e.jsx("th",{className:"px-2 py-1.5 text-center text-[10px] font-bold text-white uppercase",children:"Actions"})]})}),e.jsx("tbody",{className:"divide-y divide-gray-200 dark:divide-gray-700",children:ae.map((t,a)=>{const r=t.displayPaymentType||"Unknown",s=ge(r),o=t.paymentCount>1,l=t.isFirstPayment,u=new Set(H.slice(0,de+a+1).map(x=>x.billSequenceNumber)).size;return e.jsxs("tr",{className:`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer ${!t.isFirstPayment&&o?"border-t-0":""}`,onClick:()=>t.isFirstPayment&&xe(t),children:[e.jsx("td",{className:"px-2 py-1.5 whitespace-nowrap",children:t.isFirstPayment?e.jsxs("div",{className:"flex items-center gap-1 flex-wrap",children:[e.jsx("span",{className:`text-xs font-semibold ${t.status==="cancelled"?"text-gray-400 line-through":"text-gray-700 dark:text-gray-300"}`,children:u}),t.status==="cancelled"&&e.jsx("span",{className:"px-1.5 py-0.5 text-[8px] font-bold text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400 rounded uppercase",children:"Cancelled"}),t.payment_status==="pending"&&t.status!=="cancelled"&&e.jsx("span",{className:"px-1.5 py-0.5 text-[8px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 rounded uppercase",children:"Pending"})]}):e.jsx("span",{className:"text-xs text-gray-400 dark:text-gray-500 pl-2",children:"↳"})}),e.jsx("td",{className:"px-2 py-1.5 whitespace-nowrap",children:t.isFirstPayment?e.jsx("span",{className:"text-xs text-gray-600 dark:text-gray-400",children:new Date(t.created_at).toLocaleDateString("en-IN",{day:"2-digit",month:"2-digit",year:"numeric"})}):e.jsx("span",{className:"text-xs text-gray-400 dark:text-gray-500",children:"-"})}),e.jsx("td",{className:"px-2 py-1.5",children:t.isFirstPayment?e.jsx("span",{className:"text-xs text-gray-700 dark:text-gray-300",children:t.customer_name}):e.jsx("span",{className:"text-xs text-gray-400 dark:text-gray-500",children:"-"})}),e.jsx("td",{className:"px-2 py-1.5",children:t.isFirstPayment?e.jsx("span",{className:"text-xs text-gray-600 dark:text-gray-400",children:t.customer_phone}):e.jsx("span",{className:"text-xs text-gray-400 dark:text-gray-500",children:"-"})}),e.jsx("td",{className:"px-2 py-1.5 whitespace-nowrap",children:e.jsx("span",{className:`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-white bg-gradient-to-r ${s.bg} rounded-full uppercase shadow-sm`,children:r})}),e.jsx("td",{className:"px-2 py-1.5 text-right whitespace-nowrap",children:e.jsxs("span",{className:"text-xs font-bold text-gray-900 dark:text-white",children:["₹",t.displayAmount.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})]})}),l?e.jsx("td",{className:"px-2 py-1.5 text-center whitespace-nowrap",rowSpan:t.paymentCount,children:e.jsxs("div",{className:"flex items-center justify-center gap-1 flex-wrap",children:[t.payment_status==="pending"&&e.jsxs("button",{type:"button",onClick:x=>{x.stopPropagation(),le(t.bill_id,t.bill_number)},className:"inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 rounded transition-all border border-green-300 dark:border-green-700",title:"Mark as Paid",children:[e.jsx(pe,{className:"w-3 h-3"}),"Mark Paid"]}),e.jsxs("button",{type:"button",onClick:x=>{x.stopPropagation(),Pe(t.bill_id)},className:"inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-all",title:"Exchange Bill",children:[e.jsx(he,{className:"w-3 h-3"}),"Exchange"]}),e.jsxs("button",{type:"button",onClick:x=>{x.stopPropagation(),Ne(t.bill_id)},disabled:Z,className:"inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed",title:"Print Bill",children:[e.jsx("svg",{className:"w-3 h-3",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"})}),"Print"]}),e.jsxs("button",{type:"button",onClick:x=>{x.stopPropagation(),ce(t)},className:"inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 rounded transition-all",title:"Download PDF",children:[e.jsx("svg",{className:"w-3 h-3",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"})}),"PDF"]}),e.jsxs("button",{type:"button",onClick:x=>{x.stopPropagation(),$e(t.bill_id,t.bill_number)},className:"inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded transition-all",title:"Cancel Bill",children:[e.jsx(re,{className:"w-3 h-3"}),"Cancel"]})]})}):null]},`${t.bill_id}-${t.displayPaymentType}-${a}`)})})]})}),e.jsx("div",{className:"md:hidden space-y-3",children:ae.filter(t=>t.isFirstPayment!==!1).map(t=>{var a;return e.jsxs("div",{onClick:()=>xe(t),className:"cursor-pointer bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm active:bg-gray-50 dark:active:bg-gray-700 transition-colors",children:[e.jsxs("div",{className:"flex items-start justify-between gap-2 mb-2",children:[e.jsxs("div",{children:[e.jsxs("div",{className:"flex items-center gap-1.5",children:[e.jsxs("p",{className:"text-sm font-semibold text-gray-900 dark:text-white",children:["#",t.bill_number]}),t.payment_status==="pending"&&t.status!=="cancelled"&&e.jsx("span",{className:"px-1.5 py-0.5 text-[9px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 rounded uppercase",children:"Payment Pending"})]}),e.jsx("p",{className:"text-xs text-gray-500 dark:text-gray-400 mt-0.5",children:t.customer_name||"Walk-in"})]}),e.jsx("span",{className:`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${t.status==="cancelled"?"bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400":"bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"}`,children:t.displayPaymentType??t.payment_type})]}),e.jsxs("div",{className:"flex items-center justify-between text-xs text-gray-500 dark:text-gray-400",children:[e.jsx("span",{children:t.created_at?new Date(t.created_at).toLocaleDateString():""}),e.jsxs("span",{className:"text-sm font-bold text-gray-900 dark:text-white",children:["₹",(a=t.displayAmount)==null?void 0:a.toLocaleString()]})]}),t.payment_status==="pending"&&t.status!=="cancelled"&&e.jsxs("div",{className:"mt-2 flex gap-2",children:[e.jsxs("button",{type:"button",onClick:r=>{r.stopPropagation(),le(t.bill_id,t.bill_number)},className:"flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 rounded border border-green-300 dark:border-green-700",children:[e.jsx(pe,{className:"w-3.5 h-3.5"})," Mark Paid"]}),e.jsxs("button",{type:"button",onClick:r=>{r.stopPropagation(),ce(t)},className:"flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 rounded",children:[e.jsx("svg",{className:"w-3.5 h-3.5",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"})}),"PDF"]})]})]},`${t.bill_id}-${t.displayPaymentType??t.payment_type}`)})}),q>1&&e.jsxs("div",{className:"flex-shrink-0 flex items-center justify-center gap-1 mt-1.5",children:[e.jsx("button",{type:"button",onClick:()=>T(t=>Math.max(1,t-1)),disabled:$===1,className:"px-2.5 py-1 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-[10px] font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed",children:"Previous"}),e.jsx("div",{className:"flex gap-1",children:Array.from({length:q},(t,a)=>a+1).map(t=>e.jsx("button",{type:"button",onClick:()=>T(t),className:`w-7 h-7 rounded-md text-[10px] font-bold transition-all ${$===t?"bg-gradient-to-br from-slate-700 to-slate-600 text-white shadow-md":"bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"}`,children:t},t))}),e.jsx("button",{type:"button",onClick:()=>T(t=>Math.min(q,t+1)),disabled:$===q,className:"px-2.5 py-1 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-[10px] font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed",children:"Next"})]}),e.jsx("div",{className:"flex-shrink-0 mt-1.5 bg-gradient-to-r from-slate-800 to-slate-700 dark:from-gray-800 dark:to-gray-700 rounded-lg border border-slate-600 dark:border-gray-600 shadow-lg px-3 py-2",children:e.jsxs("div",{className:"flex justify-between items-center",children:[e.jsxs("div",{className:"flex items-center gap-6",children:[e.jsxs("div",{children:[e.jsxs("p",{className:"text-slate-400 dark:text-gray-400 text-[10px] uppercase font-medium",children:["Page ",$," of ",q||1]}),e.jsxs("p",{className:"text-slate-300 dark:text-gray-300 text-xs font-semibold",children:[ae.length," items"]})]}),e.jsxs("div",{className:"border-l border-slate-600 pl-6",children:[e.jsx("p",{className:"text-slate-400 dark:text-gray-400 text-[10px] uppercase font-medium",children:"Page Total"}),e.jsxs("p",{className:"text-yellow-400 text-sm font-bold",children:["₹",ae.reduce((t,a)=>t+a.displayAmount,0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})]})]})]}),e.jsxs("div",{className:"text-right",children:[e.jsx("p",{className:"text-slate-400 dark:text-gray-400 text-[10px] uppercase font-medium",children:h==="all"?`Grand Total (${_.length} bills)${v!=="all"?` • ${v==="today"?"Today":"Custom"}`:""}`:`${((ue=P.find(t=>t.payment_type_id===h))==null?void 0:ue.payment_name)||h} (${new Set(H.map(t=>t.bill_id)).size} bills)`}),e.jsxs("p",{className:"text-white text-lg font-bold",children:["₹",_e.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})]})]})]})})]})]}),i&&e.jsxs("div",{className:"fixed inset-0 z-50 flex justify-end",onClick:()=>z(null),children:[e.jsx("div",{className:"absolute inset-0 bg-black/40 backdrop-blur-sm"}),e.jsxs("div",{className:"relative w-full max-w-md bg-white dark:bg-gray-900 h-full shadow-2xl overflow-y-auto flex flex-col",onClick:t=>t.stopPropagation(),children:[e.jsxs("div",{className:"flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800",children:[e.jsxs("div",{children:[e.jsxs("h2",{className:"text-base font-semibold text-gray-900 dark:text-white",children:["Bill #",i.bill_number]}),e.jsx("span",{className:`text-xs px-2 py-0.5 rounded-full font-medium ${i.type==="gst"?"bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300":"bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"}`,children:i.type==="gst"?"GST":"Non-GST"})]}),e.jsx("button",{type:"button",onClick:()=>z(null),className:"p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors",children:e.jsx(ze,{className:"w-5 h-5"})})]}),e.jsxs("div",{className:"px-5 py-4 grid grid-cols-2 gap-3 border-b border-gray-200 dark:border-gray-700",children:[e.jsxs("div",{className:"flex items-start gap-2",children:[e.jsx(Oe,{className:"w-4 h-4 text-gray-400 mt-0.5 shrink-0"}),e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] text-gray-400 uppercase font-medium",children:"Customer"}),e.jsx("p",{className:"text-sm text-gray-800 dark:text-gray-200",children:i.customer_name||"Walk-In"}),i.customer_phone&&e.jsx("p",{className:"text-xs text-gray-500 dark:text-gray-400",children:i.customer_phone})]})]}),e.jsxs("div",{className:"flex items-start gap-2",children:[e.jsx(Ye,{className:"w-4 h-4 text-gray-400 mt-0.5 shrink-0"}),e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] text-gray-400 uppercase font-medium",children:"Date"}),e.jsx("p",{className:"text-sm text-gray-800 dark:text-gray-200",children:new Date(i.created_at).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}),e.jsx("p",{className:"text-xs text-gray-500 dark:text-gray-400",children:new Date(i.created_at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})})]})]}),e.jsxs("div",{className:"flex items-start gap-2",children:[e.jsx(fe,{className:"w-4 h-4 text-gray-400 mt-0.5 shrink-0"}),e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] text-gray-400 uppercase font-medium",children:"Payment"}),e.jsx("p",{className:"text-sm text-gray-800 dark:text-gray-200",children:i.payment_type?(()=>{const t=i.payment_type;if(typeof t=="string"&&t.trim().startsWith("["))try{const a=JSON.parse(t);return Array.isArray(a)?a.map(r=>`${r.payment_type||r.PAYMENT_TYPE||""}${r.amount||r.AMOUNT?` ₹${r.amount||r.AMOUNT}`:""}`).join(" + "):t}catch{return t}return t})():"—"})]})]}),i.status==="cancelled"&&e.jsxs("div",{className:"flex items-start gap-2",children:[e.jsx(re,{className:"w-4 h-4 text-red-400 mt-0.5 shrink-0"}),e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] text-gray-400 uppercase font-medium",children:"Status"}),e.jsx("p",{className:"text-sm text-red-500 font-medium",children:"Cancelled"})]})]})]}),e.jsxs("div",{className:"px-5 py-4 flex-1",children:[e.jsxs("div",{className:"flex items-center gap-2 mb-3",children:[e.jsx(qe,{className:"w-4 h-4 text-gray-400"}),e.jsx("h3",{className:"text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase",children:"Items"})]}),i.items&&i.items.length>0?e.jsx("div",{className:"space-y-2",children:i.items.map((t,a)=>e.jsxs("div",{className:"flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0",children:[e.jsxs("div",{className:"flex-1 min-w-0",children:[e.jsx("p",{className:"text-sm text-gray-800 dark:text-gray-200 truncate",children:t.product_name}),e.jsxs("p",{className:"text-xs text-gray-500 dark:text-gray-400",children:[t.quantity," × ₹",(t.rate||0).toLocaleString("en-IN"),t.gst_percentage?` + ${t.gst_percentage}% GST`:""]})]}),e.jsxs("p",{className:"text-sm font-medium text-gray-800 dark:text-gray-200 shrink-0 ml-3",children:["₹",(t.amount||0).toLocaleString("en-IN",{minimumFractionDigits:2})]})]},a))}):e.jsx("p",{className:"text-sm text-gray-400 italic",children:"No item details available"})]}),e.jsxs("div",{className:"px-5 py-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 space-y-2",children:[i.type==="gst"&&i.subtotal!==void 0&&e.jsxs("div",{className:"flex justify-between text-sm text-gray-600 dark:text-gray-400",children:[e.jsx("span",{children:"Subtotal"}),e.jsxs("span",{children:["₹",(i.subtotal||0).toLocaleString("en-IN",{minimumFractionDigits:2})]})]}),i.gst_amount!==void 0&&i.gst_amount>0&&e.jsxs("div",{className:"flex justify-between text-sm text-gray-600 dark:text-gray-400",children:[e.jsxs("span",{children:["GST (",i.gst_percentage||0,"%)"]}),e.jsxs("span",{children:["₹",(i.gst_amount||0).toLocaleString("en-IN",{minimumFractionDigits:2})]})]}),i.discount_amount!==void 0&&i.discount_amount>0&&e.jsxs("div",{className:"flex justify-between text-sm text-red-500",children:[e.jsxs("span",{children:["Discount ",i.discount_percentage?`(${i.discount_percentage}%)`:""]}),e.jsxs("span",{children:["-₹",(i.discount_amount||0).toLocaleString("en-IN",{minimumFractionDigits:2})]})]}),e.jsxs("div",{className:"flex justify-between text-base font-bold text-gray-900 dark:text-white pt-2 border-t border-gray-200 dark:border-gray-700",children:[e.jsx("span",{children:"Total"}),e.jsxs("span",{children:["₹",((i.final_amount??i.total_amount)||0).toLocaleString("en-IN",{minimumFractionDigits:2})]})]}),i.payment_status==="pending"&&i.status!=="cancelled"&&e.jsxs("div",{className:"mt-3 flex items-center justify-between p-2.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("span",{className:"text-amber-600 dark:text-amber-400 text-sm",children:"⏳"}),e.jsx("span",{className:"text-sm font-semibold text-amber-700 dark:text-amber-400",children:"Payment Pending"})]}),e.jsxs("button",{type:"button",onClick:()=>le(i.bill_id,i.bill_number),className:"inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition",children:[e.jsx(pe,{className:"w-3.5 h-3.5"}),"Mark Paid"]})]}),e.jsx("div",{className:"mt-3 flex gap-2",children:e.jsxs("button",{type:"button",onClick:()=>ce(i),className:"flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 rounded-lg border border-purple-200 dark:border-purple-700 transition",children:[e.jsx("svg",{className:"w-4 h-4",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"})}),"Download PDF"]})})]})]})]}),E&&e.jsxs("div",{className:"fixed inset-0 z-[60] flex items-center justify-center",onClick:()=>F(null),children:[e.jsx("div",{className:"absolute inset-0 bg-black/50 backdrop-blur-sm"}),e.jsxs("div",{className:"relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 border border-gray-200 dark:border-gray-700",onClick:t=>t.stopPropagation(),children:[e.jsxs("div",{className:"flex items-center gap-3 mb-4",children:[e.jsx("div",{className:"w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0",children:e.jsx(re,{className:"w-5 h-5 text-red-600 dark:text-red-400"})}),e.jsxs("div",{children:[e.jsxs("h3",{className:"text-base font-semibold text-gray-900 dark:text-white",children:["Cancel Bill #",E.billNumber,"?"]}),e.jsx("p",{className:"text-xs text-gray-500 dark:text-gray-400 mt-0.5",children:"This will restore all item quantities to stock."})]})]}),e.jsxs("div",{className:"flex gap-2 mt-5",children:[e.jsx("button",{type:"button",onClick:()=>F(null),className:"flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition",children:"No, Keep Bill"}),e.jsx("button",{type:"button",onClick:Ce,className:"flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition",children:"Yes, Cancel Bill"})]})]})]})]})}export{jt as default};
