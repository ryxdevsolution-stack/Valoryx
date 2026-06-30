const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/webPrintService-Cyl1MEH4.js","assets/vendor-Bq8eTzyd.js","assets/billNumber-Bj2_t-HG.js","assets/regions-Cv0ThQsv.js"])))=>i.map(i=>d[i]);
import{c as _e,t as ee,u as Le,a as Z,j as e,b as ie,R as fe,d as xe,X as Ee,_ as ve,e as Fe,B as Me}from"./index-4hoLt6Bz.js";import{u as Re,d as Ie,r as m,L as Ue}from"./vendor-Bq8eTzyd.js";import{D as He,B as Qe}from"./DashboardLayout-WfmQYDb8.js";import{f as le}from"./billNumber-Bj2_t-HG.js";import{C as Oe,T as Ge}from"./SkeletonLoader-RMZ1-Tu9.js";import{f as We,u as Ye}from"./useCurrency-KyUG7ZLB.js";import{C as de}from"./regions-Cv0ThQsv.js";import{g as qe}from"./shopSettingsService-DYlPoLzI.js";import{R as Ve}from"./rotate-ccw-Cypd8WWB.js";import{C as Je}from"./calendar-ClqQCkNw.js";import{F as we}from"./file-text-BDu_Lu8C.js";import{U as Ke}from"./user-MRmZU_GO.js";import{C as Xe}from"./clock-Bg5OQYT_.js";import{P as Ze}from"./package-DmW60BuU.js";import{D as et}from"./dollar-sign-Ba5uBBm6.js";import"./search-D4-jxoQw.js";import"./loader-circle-5ylZwLWl.js";import"./trending-up-h3Ui0beK.js";import"./truck-yzJ4lf7k.js";import"./chevron-right-B-miWCpO.js";import"./menu-BVXvW5nz.js";import"./zap-0hPJe13t.js";import"./triangle-alert-CNHvBBKf.js";/**
 * @license lucide-react v0.548.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const tt=[["rect",{width:"14",height:"20",x:"5",y:"2",rx:"2",ry:"2",key:"1yt0o3"}],["path",{d:"M12 18h.01",key:"mhygvu"}]],at=_e("smartphone",tt);/**
 * @license lucide-react v0.548.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const rt=[["path",{d:"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1",key:"18etb6"}],["path",{d:"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4",key:"xoc0q4"}]],ke=_e("wallet",rt);function st(s){if(s.currency_symbol)return s.currency_symbol;if(s.currency_code&&de[s.currency_code])return de[s.currency_code];try{const i=JSON.parse(localStorage.getItem("client")||"{}");if(i.currency_symbol)return i.currency_symbol;if(i.currency_code&&de[i.currency_code])return de[i.currency_code]}catch{}return"₹"}function nt(s){if(s.locale)return s.locale;try{const i=JSON.parse(localStorage.getItem("client")||"{}");if(i.locale)return i.locale}catch{}return"en-IN"}function ot(s){const i=new Date(s),l=i.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}),g=i.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",hour12:!0});return`${l} | ${g}`}function it(s){try{const i=JSON.parse(s);if(Array.isArray(i))return i.map(l=>l.payment_name||l.payment_type||"Cash").join(" + ")}catch{}return s||"Cash"}function dt(s){return!s||s.length<4?s:"••••••"+s.slice(-4)}function f(s){return s?s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"):""}async function lt(s){try{const i=await fetch(s,{mode:"cors"});if(!i.ok)return null;const l=await i.blob();return await new Promise((g,S)=>{const v=new FileReader;v.onloadend=()=>g(v.result),v.onerror=S,v.readAsDataURL(l)})}catch{return null}}async function ct(s,i){var ne,H,Q;const l=s.type==="gst",g=l?s.final_amount:s.total_amount,S=s.payment_status==="pending",v=it(s.payment_type),F=st(s),W=nt(s),k=p=>We(p,F,W);let Y=null;i.logo_url&&(Y=await lt(i.logo_url));const te=f(i.client_name.charAt(0).toUpperCase()),h=Y?`<img src="${Y}" alt="Logo" class="logo-img" />`:`<div class="logo-letter">${te}</div>`,M=[i.address,i.address2].filter(Boolean).map(f).join(", "),$=[],T=[];i.gstin&&$.push(`<div class="biz-row"><span class="biz-lbl">GSTIN</span><span class="biz-val">${f(i.gstin)}</span></div>`),T.push(`<div class="biz-row"><span class="biz-lbl">Legal Name</span><span class="biz-val">${f(i.client_name)}</span></div>`),i.phone&&$.push(`<div class="biz-row"><span class="biz-lbl">Phone</span><span class="biz-val">${f(i.phone)}</span></div>`),i.email&&T.push(`<div class="biz-row"><span class="biz-lbl">Email</span><span class="biz-val">${f(i.email)}</span></div>`),s.customer_gstin&&$.push(`<div class="biz-row"><span class="biz-lbl">Cust. GSTIN</span><span class="biz-val">${f(s.customer_gstin)}</span></div>`),T.push(`<div class="biz-row"><span class="biz-lbl">Bill Type</span><span class="biz-val">${l?"GST Invoice":"Invoice"}</span></div>`);const ce=`
    <div class="biz-grid">
      <div class="biz-col">${$.join("")}</div>
      <div class="biz-col">${T.join("")}</div>
    </div>`,q=s.customer_name&&s.customer_name!=="Walk-in Customer"?f(s.customer_name.split(" ")[0]):null,d=q?`Hi ${q}, here's your bill!`:"Here's your bill!",D=s.customer_phone?dt(s.customer_phone):null,_=((H=(ne=s.tax_breakdown)==null?void 0:ne[0])==null?void 0:H.name)||(()=>{var p;try{return(p=JSON.parse(localStorage.getItem("client")||"{}").tax_config)==null?void 0:p.name}catch{return}})()||"GST",R=l?`<th class="tc gst-th">${f(_)} %</th>`:"",w=s.items.some(p=>Number(p.discount_percentage||0)>0),O=w?'<th class="tc">Disc %</th>':"",N=s.items.map((p,z)=>{const B=l?`<td class="tc muted">${p.gst_percentage}%</td>`:"",L=Number(p.discount_percentage||0),K=w?`<td class="tc muted">${L>0?`${L}%`:"−"}</td>`:"";return`
      <tr class="${z%2===0?"":"row-alt"}">
        <td class="item-td">
          <span class="item-name">${f(p.product_name)}</span>
          ${p.item_code?`<span class="item-code">${f(p.item_code)}</span>`:""}
        </td>
        <td class="tc">${p.quantity}</td>
        <td class="tr">${k(p.rate)}</td>
        ${K}
        ${B}
        <td class="tr fw">${k(p.amount)}</td>
      </tr>`}).join(""),I=s.discount_amount||0,U=s.negotiable_amount||0,j=[];if(j.push(`<tr><td class="tot-lbl">Subtotal</td><td class="tot-val">${k(s.subtotal||g)}</td></tr>`),I>0){const p=s.discount_percentage?`Discount (${s.discount_percentage}%)`:"Discount";j.push(`<tr><td class="tot-lbl">${p}</td><td class="tot-val green">− ${k(I)}</td></tr>`)}else U>0&&j.push(`<tr><td class="tot-lbl">Negotiated</td><td class="tot-val green">− ${k(U)}</td></tr>`);const u=Number(s.membership_redeemed)||0;if(u>0){const p=(Q=s.membership)!=null&&Q.points_redeemed?`Points Redeemed (${s.membership.points_redeemed} pts)`:"Points Redeemed";j.push(`<tr><td class="tot-lbl">${p}</td><td class="tot-val green">− ${k(u)}</td></tr>`)}if(l){const p=s.tax_breakdown&&s.tax_breakdown.length>0?s.tax_breakdown:[{name:"CGST",amount:s.cgst},{name:"SGST",amount:s.sgst}];for(const z of p)j.push(`<tr><td class="tot-lbl">${f(z.name)}</td><td class="tot-val">${k(Number(z.amount))}</td></tr>`)}const re=i.receipt_footer?`<p class="footer-note">${f(i.receipt_footer)}</p>`:"",P=s.membership,se=P?`<div class="points-panel">
         <div class="confetti-bg">
           <div class="points-inner">
             <div class="points-label">Member ${f(P.card_number||"")}</div>
             <div class="points-value">+${P.points_earned} Points</div>
             <div class="points-sub">Balance: ${P.points_balance} pts &middot; T&amp;C applied</div>
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
         </div>`:"",V=S?'<div class="pending-banner">⏳ &nbsp;PAYMENT PENDING — NOT YET COLLECTED</div>':"",J=`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Invoice #${le(s)} — ${f(i.client_name)}</title>
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
    <div class="logo-circle">${h}</div>
    <div class="location-block">
      <div class="location-line">
        <span class="location-pin">📍</span>
        <span>${M}</span>
      </div>
      <span class="view-store">${f(i.client_name)}</span>
    </div>
  </div>

  <!-- Brand accent bar -->
  <div class="brand-bar"></div>

  ${V}

  <!-- Business info 2-col -->
  <div class="biz-section">${ce}</div>

  <hr class="dash"/>

  <!-- Greeting -->
  <div class="greeting-row">
    <span class="greeting-text">${d}</span>
    <span class="dl-icon">⬇</span>
  </div>

  <hr class="dash"/>

  <!-- Amount hero -->
  <div class="amount-hero">
    <div class="amount-row-top">
      <div>
        <div class="amount-main">
          ${k(g)}
          <span class="${S?"status-chip chip-pending":"status-chip chip-paid"}">${S?"Pending":"Paid"}</span>
        </div>
        <div class="amount-payment">${f(v)}</div>
      </div>
      <div class="amount-meta">
        <div class="meta-date">${ot(s.created_at)}</div>
        <div class="meta-items">${s.items.length} item${s.items.length!==1?"s":""}</div>
      </div>
    </div>
  </div>

  <!-- Bill # + masked phone row -->
  <div class="bill-meta-row">
    <span class="meta-pill">Bill <strong>#${le(s)}</strong></span>
    ${D?`<span class="meta-pill">Mobile <strong>${f(D)}</strong></span>`:`<span class="cashier-note">Cashier: ${f(s.user_name||"Admin")}</span>`}
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
          ${O}
          ${R}
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
      ${j.join("")}
      <tr class="grand-row">
        <td class="grand-lbl">Grand Total</td>
        <td class="grand-val">${k(g)}</td>
      </tr>
    </table>
  </div>

  <!-- Footer note -->
  ${re?`<div class="card-footer">${re}</div>`:""}

  <!-- Wavy bottom SVG — colour matches page background (#ebebeb) -->
  <div class="wave-wrap">
    <svg viewBox="0 0 500 28" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M0,0 Q12.5,28 25,0 Q37.5,28 50,0 Q62.5,28 75,0 Q87.5,28 100,0 Q112.5,28 125,0 Q137.5,28 150,0 Q162.5,28 175,0 Q187.5,28 200,0 Q212.5,28 225,0 Q237.5,28 250,0 Q262.5,28 275,0 Q287.5,28 300,0 Q312.5,28 325,0 Q337.5,28 350,0 Q362.5,28 375,0 Q387.5,28 400,0 Q412.5,28 425,0 Q437.5,28 450,0 Q462.5,28 475,0 Q487.5,28 500,0 L500,28 L0,28 Z" fill="#ebebeb"/>
    </svg>
  </div>

</div>
<!-- ═══ END CARD ═════════════════════════════════════════ -->

<!-- Loyalty points panel (festive, below card) -->
${se}

<!-- Powered by -->
<div class="powered-row">Powered by <strong>Valoryx</strong></div>

<!-- Action buttons -->
<div class="actions">
  <button class="btn btn-secondary" onclick="window.close()">Close</button>
  <button class="btn btn-primary" onclick="window.print()">Save as PDF / Print</button>
</div>

</body>
</html>`,G=new Blob([J],{type:"text/html;charset=utf-8"}),A=URL.createObjectURL(G);window.open(A,"_blank","width=580,height=900,scrollbars=yes")||ee.error("Popup blocked — please allow popups for this site to generate PDFs."),setTimeout(()=>URL.revokeObjectURL(A),3e4)}function Bt(){var be;const s=Re(),i=Ie(),{client:l}=Le(),{symbol:g,taxLabel:S}=Ye(),[v,F]=m.useState([]),[W,k]=m.useState([]),[Y,te]=m.useState(!0),[h,ae]=m.useState("all"),[M,$]=m.useState(1),T=17,[ce,q]=m.useState(!1),[d,D]=m.useState(null),[_,R]=m.useState("all"),[w,O]=m.useState(""),[N,I]=m.useState(""),[U,j]=m.useState(null),[u,re]=m.useState(null),P=m.useRef(null),se=m.useRef(!0);m.useEffect(()=>{G(),qe().then(re).catch(()=>{})},[]),m.useEffect(()=>{if(se.current){se.current=!1;return}P.current=null,G()},[i.key]),m.useEffect(()=>{const t=i.state;t!=null&&t.refreshAfterExchange&&(s(i.pathname,{replace:!0,state:{}}),P.current=null,G())},[i.state]);const V=m.useMemo(()=>{const t=new Map;return v.forEach(a=>{if(!a.payment_type){t.set(a.bill_id,[]);return}const r=String(a.payment_type).trim();if(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(r)){t.set(a.bill_id,[]);return}if(r.startsWith("["))try{const n=JSON.parse(r);if(Array.isArray(n)){t.set(a.bill_id,n.map(o=>o.PAYMENT_TYPE||o.payment_type||o.payment_name).filter(Boolean));return}}catch{}t.set(a.bill_id,[r])}),t},[v]),J=t=>V.get(t.bill_id)??[],G=async()=>{P.current=null;const t=(async()=>{try{te(!0);const r=(await Z.get("/billing/list?limit=100&status=final")).data.bills||[];if(F(r),r.length>0){const n=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,o=new Set;r.forEach(b=>{if(!b.payment_type)return;const x=String(b.payment_type).trim();if(!n.test(x)){if(x.startsWith("["))try{const E=JSON.parse(x);if(Array.isArray(E)){E.forEach(C=>{const X=C.PAYMENT_TYPE||C.payment_type||C.payment_name;X&&o.add(X)});return}}catch{}o.add(x)}});const c=["CASH","UPI","CARD","CREDIT CARD","NET BANKING","CHEQUE","CREDIT","WALLET"],y=Array.from(o).sort((b,x)=>{const E=c.indexOf(b.toUpperCase()),C=c.indexOf(x.toUpperCase());return E!==-1&&C!==-1?E-C:E!==-1?-1:C!==-1?1:b.localeCompare(x)});k(y.map(b=>({payment_type_id:b,payment_name:b})))}}catch{}finally{te(!1),P.current=null}})();return P.current=t,t},A=t=>t.status==="cancelled"?0:t.type==="gst"?parseFloat(String(t.final_amount||"0")):parseFloat(String(t.total_amount||"0")),ge=(t,a)=>{const r=A(t);if(typeof t.payment_type=="string"&&t.payment_type.trim().startsWith("["))try{const n=JSON.parse(t.payment_type);if(Array.isArray(n)){const o=n.find(c=>(c.PAYMENT_TYPE||c.payment_type)===a);if(o)return parseFloat(String(o.AMOUNT||o.amount||0))}}catch{return t.payment_type===a?r:0}return t.payment_type===a?r:0},ne=t=>{const a=[];let r=0;return t.forEach(n=>{const o=J(n);r++,o.length>1?o.forEach((c,y)=>{a.push({...n,displayPaymentType:c,displayAmount:ge(n,c),isFirstPayment:y===0,paymentCount:o.length,billSequenceNumber:r})}):a.push({...n,displayPaymentType:o[0]||n.payment_type,displayAmount:A(n),isFirstPayment:!0,paymentCount:1,billSequenceNumber:r})}),a},H=m.useCallback(t=>{const a=t.getFullYear(),r=String(t.getMonth()+1).padStart(2,"0"),n=String(t.getDate()).padStart(2,"0");return`${a}-${r}-${n}`},[]),Q=m.useMemo(()=>H(new Date),[H]),p=m.useMemo(()=>v.filter(t=>{if(_==="all")return!0;const a=H(new Date(t.created_at));return _==="today"?a===Q:w&&N?a>=w&&a<=N:w?a>=w:N?a<=N:!0}),[v,_,w,N,Q,H]),z=m.useMemo(()=>ne(p),[p]),B=m.useMemo(()=>h==="all"?z:z.filter(t=>{const a=V.get(t.bill_id)??[],r=a.length===1&&a[0].includes("+")?a[0].split("+"):a;return h.includes("+")?r.length<=1?!1:[...r].sort().join("+")===h:r.length===1&&t.displayPaymentType===h}),[z,h,V]),L=Math.ceil(B.length/T),K=(M-1)*T,Ne=K+T,oe=B.slice(K,Ne),je=m.useMemo(()=>p.reduce((t,a)=>t+A(a),0),[p]),Pe=m.useMemo(()=>B.reduce((t,a)=>t+a.displayAmount,0),[B]),$e=m.useMemo(()=>W.map(t=>{let a=0,r=0;return p.forEach(n=>{const o=J(n);o.length===1&&o[0]===t.payment_type_id&&(a+=1,r+=A(n))}),{...t,count:a,total:r}}),[W,p]),ue=m.useMemo(()=>{const t=new Map;return p.forEach(a=>{const r=J(a);if(r.length>1){const n=[...r].sort(),o=n.join("+"),c=t.get(o)||{count:0,total:0,types:n};c.count+=1,c.total+=A(a),t.set(o,c)}}),Array.from(t.entries()).map(([a,r])=>({id:a,name:a,count:r.count,total:r.total,types:r.types}))},[p]);m.useEffect(()=>{$(1)},[h,_,w,N]);const Ce=async t=>{try{q(!0);let a=v.find(y=>y.bill_id===t);if((!(a!=null&&a.items)||a.items.length===0)&&(a=(await Z.get(`/billing/${t}`)).data.bill),!a)throw new Error("Bill data not found");const r={bill_number:a.bill_number,customer_name:a.customer_name,customer_phone:a.customer_phone,items:a.items,subtotal:a.subtotal||a.total_amount||0,discount_percentage:a.discount_percentage,discount_amount:a.discount_amount,negotiable_amount:a.negotiable_amount||0,gst_amount:a.gst_amount||0,gst_percentage:a.gst_percentage||0,final_amount:a.final_amount||a.total_amount||0,total_amount:a.total_amount||a.subtotal||0,payment_type:a.payment_type,created_at:a.created_at,type:a.type,cgst:a.cgst||0,sgst:a.sgst||0,igst:a.igst||0,user_name:a.user_name||a.created_by_name||a.created_by||"Admin"},n=l?{client_name:l.client_name,address:l.address,phone:l.phone,email:l.email,gstin:l.gstin,logo_url:l.logo_url,upi_id:l.upi_id||"",receipt_footer:l.receipt_footer||""}:{client_name:"Business Name",address:"",phone:"",email:"",gstin:"",logo_url:"",upi_id:"",receipt_footer:""},o=typeof window<"u"?window.electronAPI:null;if(o&&typeof o.silentPrint=="function")try{const{generateReceiptHtml:y,generateUpiQrDataUrl:b}=await ve(async()=>{const{generateReceiptHtml:ze,generateUpiQrDataUrl:Be}=await import("./webPrintService-Cyl1MEH4.js");return{generateReceiptHtml:ze,generateUpiQrDataUrl:Be}},__vite__mapDeps([0,1,2,3])),x=r.type==="gst"?Number(r.final_amount):Number(r.total_amount),E=n.upi_id?await b(n.upi_id,n.client_name||"",x,r.bill_number):void 0,C=y(r,n,!0,E),X=await o.silentPrint(C,null);if(!X.success)throw new Error(X.error||"Print failed")}catch(y){ee.error("Print failed: "+(y.message||"Unknown error"))}else{const{printBill:y}=await ve(async()=>{const{printBill:x}=await import("./webPrintService-Cyl1MEH4.js");return{printBill:x}},__vite__mapDeps([0,1,2,3])),b=await y(r,n,!0);if(!b.success)throw new Error(b.message||"Print failed")}}catch(a){ee.error(a.message||"Print failed. Please try again.")}finally{q(!1)}},he=async t=>{D(t);try{const r=(await Z.get(`/billing/${t.bill_id}`)).data.bill;D(n=>n&&n.bill_id===t.bill_id?{...n,...r}:n),F(n=>n.map(o=>o.bill_id===t.bill_id?{...o,...r}:o))}catch{}},Se=t=>{s(`/billing/exchange/${t}`)},Te=async(t,a)=>{j({billId:t,billNumber:a})},De=async()=>{var r,n;if(!U)return;const{billId:t,billNumber:a}=U;j(null);try{(await Z.post(`/billing/${t}/cancel`)).data.success&&F(c=>c.map(y=>y.bill_id===t?{...y,status:"cancelled"}:y))}catch(o){const c=((n=(r=o.response)==null?void 0:r.data)==null?void 0:n.error)||"Failed to cancel bill";c.includes("already cancelled")?F(y=>y.map(b=>b.bill_id===t?{...b,status:"cancelled"}:b)):ee.error(c)}},pe=async(t,a)=>{var r,n;if(window.confirm(`Mark Bill #${a} as Paid?`))try{await Z.put(`/billing/${t}/mark-paid`),F(o=>o.map(c=>c.bill_id===t?{...c,payment_status:"paid"}:c)),(d==null?void 0:d.bill_id)===t&&D(o=>o&&{...o,payment_status:"paid"})}catch(o){ee.error(((n=(r=o.response)==null?void 0:r.data)==null?void 0:n.error)||"Failed to mark as paid")}},me=async t=>{const a={client_name:(u==null?void 0:u.shop_name)||(l==null?void 0:l.client_name)||"Business",address:(u==null?void 0:u.address1)||(l==null?void 0:l.address)||"",address2:(u==null?void 0:u.address2)||"",phone:(u==null?void 0:u.phone)||(l==null?void 0:l.phone)||"",gstin:(u==null?void 0:u.gst_number)||(l==null?void 0:l.gstin)||"",logo_url:(l==null?void 0:l.logo_url)||"",receipt_footer:(u==null?void 0:u.receipt_footer)||""},r=t.type==="gst",n=r?t.final_amount??0:t.total_amount??0,o={bill_number:t.bill_number,customer_name:t.customer_name||"Walk-in Customer",customer_phone:t.customer_phone||"",items:(t.items||[]).map(c=>({product_id:"",product_name:c.product_name,item_code:c.item_code||"",hsn_code:"",unit:"pcs",quantity:c.quantity,rate:c.rate,mrp:c.mrp,gst_percentage:c.gst_percentage??0,gst_amount:c.quantity*c.rate*(c.gst_percentage??0)/100,amount:c.amount})),subtotal:t.subtotal??n,discount_percentage:t.discount_percentage??0,discount_amount:t.discount_amount??0,negotiable_amount:t.negotiable_amount,gst_amount:t.gst_amount??0,final_amount:t.final_amount??n,total_amount:t.total_amount??n,payment_type:t.payment_type||"[]",created_at:t.created_at,type:r?"gst":"non-gst",cgst:t.cgst??0,sgst:t.sgst??0,igst:t.igst??0,user_name:t.user_name||"",payment_status:t.payment_status||"paid"};await ct(o,a)},Ae=t=>{const a=t.toUpperCase();return a.includes("CASH")?Qe:a.includes("UPI")?at:a.includes("CARD")?Fe:a.includes("BANK")||a.includes("NET")?Me:a.includes("WALLET")?ke:a.includes("CHEQUE")||a.includes("CHECK")?we:et},ye=t=>{const a=t.toUpperCase();return a.includes("CASH")?{bg:"from-green-500 to-green-600",text:"text-green-600",border:"border-green-500"}:a.includes("UPI")?{bg:"from-purple-500 to-purple-600",text:"text-purple-600",border:"border-purple-500"}:a.includes("CARD")?{bg:"from-blue-500 to-blue-600",text:"text-blue-600",border:"border-blue-500"}:a.includes("BANK")||a.includes("NET")?{bg:"from-indigo-500 to-indigo-600",text:"text-indigo-600",border:"border-indigo-500"}:a.includes("WALLET")?{bg:"from-orange-500 to-orange-600",text:"text-orange-600",border:"border-orange-500"}:a.includes("CHEQUE")||a.includes("CHECK")?{bg:"from-teal-500 to-teal-600",text:"text-teal-600",border:"border-teal-500"}:a.includes("PENDING")?{bg:"from-amber-500 to-amber-600",text:"text-amber-600",border:"border-amber-500"}:{bg:"from-gray-500 to-gray-600",text:"text-gray-600",border:"border-gray-500"}};return e.jsxs(He,{children:[e.jsxs("div",{className:"flex flex-col h-[calc(100vh-6rem)]",children:[e.jsx("div",{className:"flex-shrink-0 mb-2",children:e.jsxs("div",{className:"flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",children:[e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsxs("div",{children:[e.jsx("h1",{className:"text-lg font-bold text-gray-900 dark:text-white",children:"All Bills"}),e.jsx("p",{className:"text-[10px] text-gray-600 dark:text-gray-400",children:"Filter by date and payment method"})]}),e.jsxs(Ue,{to:"/billing/restore",className:"flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white transition-colors",children:[e.jsx(Ve,{className:"w-3.5 h-3.5",strokeWidth:2}),"Cancelled Bills"]})]}),e.jsxs("div",{className:"flex flex-wrap items-center gap-1.5",children:[e.jsx("button",{type:"button",onClick:()=>{R("all"),O(""),I("")},className:`px-2 py-1 text-[10px] font-medium rounded transition-all ${_==="all"?"bg-slate-700 text-white":"bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"}`,children:"All"}),e.jsxs("button",{type:"button",onClick:()=>{R("today"),O(""),I("")},className:`flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded transition-all ${_==="today"?"bg-blue-600 text-white":"bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"}`,children:[e.jsx(Je,{className:"w-3 h-3"}),"Today"]}),e.jsx("div",{className:"w-px h-5 bg-gray-300 dark:bg-gray-600"}),e.jsxs("div",{className:"flex items-center gap-1",children:[e.jsx("span",{className:"text-[9px] text-gray-500 dark:text-gray-400",children:"From"}),e.jsx("input",{type:"date",value:w,max:N||Q,onChange:t=>{O(t.target.value),R("custom")},className:"text-sm font-semibold text-gray-900 dark:text-white bg-transparent border border-gray-300 dark:border-gray-600 rounded px-2 py-1 cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500"})]}),e.jsxs("div",{className:"flex items-center gap-1",children:[e.jsx("span",{className:"text-[9px] text-gray-500 dark:text-gray-400",children:"To"}),e.jsx("input",{type:"date",value:N,min:w,max:Q,onChange:t=>{I(t.target.value),R("custom")},className:"text-sm font-semibold text-gray-900 dark:text-white bg-transparent border border-gray-300 dark:border-gray-600 rounded px-2 py-1 cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500"})]}),_==="custom"&&(w||N)&&e.jsx("button",{type:"button",onClick:()=>{R("all"),O(""),I("")},className:"p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300",title:"Clear dates",children:e.jsx(ie,{className:"w-3.5 h-3.5"})})]})]})}),Y?e.jsxs("div",{className:"space-y-4",children:[e.jsx(Oe,{count:4}),e.jsx(Ge,{rows:10})]}):v.length===0?e.jsx("div",{className:"flex-1 flex items-center justify-center bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow",children:e.jsxs("div",{className:"text-center",children:[e.jsx("p",{className:"text-gray-600 dark:text-gray-400 text-base",children:"No bills found"}),e.jsx("p",{className:"text-gray-500 dark:text-gray-500 text-sm mt-1",children:"Create your first bill to get started"})]})}):e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"flex-shrink-0 mb-2 overflow-x-auto scrollbar-hide",children:e.jsxs("div",{className:"flex gap-1.5 pb-1 min-w-max",children:[e.jsxs("button",{type:"button",onClick:()=>{ae("all"),G()},className:`group flex items-center gap-1.5 px-2 py-1.5 rounded-md border transition-all duration-200 ${h==="all"?"bg-gradient-to-br from-slate-700 to-slate-600 border-slate-600 shadow-md":"bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:border-slate-400 dark:hover:border-slate-500 hover:shadow-sm"}`,children:[e.jsx("div",{className:`p-1 rounded ${h==="all"?"bg-white/20":"bg-gray-100 dark:bg-gray-700"}`,children:e.jsx(we,{className:`w-3 h-3 ${h==="all"?"text-white":"text-gray-600 dark:text-gray-300"}`})}),e.jsxs("div",{className:"text-left",children:[e.jsx("p",{className:`text-[9px] font-medium ${h==="all"?"text-white/80":"text-gray-500 dark:text-gray-400"}`,children:"All Bills"}),e.jsxs("div",{className:"flex items-baseline gap-1",children:[e.jsx("span",{className:`text-sm font-bold ${h==="all"?"text-white":"text-gray-900 dark:text-white"}`,children:p.length}),e.jsxs("span",{className:`text-[10px] font-medium ${h==="all"?"text-white/80":"text-gray-600 dark:text-gray-400"}`,children:[g,je.toLocaleString("en-IN",{maximumFractionDigits:0})]})]})]})]}),$e.map(t=>{const a=Ae(t.payment_name),r=ye(t.payment_name),n=h===t.payment_type_id;return e.jsxs("button",{type:"button",onClick:()=>ae(t.payment_type_id),className:`group flex items-center gap-1.5 px-2 py-1.5 rounded-md border transition-all duration-200 ${n?`bg-gradient-to-br ${r.bg} border-transparent shadow-md`:`bg-white dark:bg-gray-800 ${r.border} border-opacity-30 dark:border-opacity-30 hover:border-opacity-60 hover:shadow-sm`}`,children:[e.jsx("div",{className:`p-1 rounded ${n?"bg-white/20":`bg-${r.text.split("-")[1]}-50 dark:bg-${r.text.split("-")[1]}-900/20`}`,children:e.jsx(a,{className:`w-3 h-3 ${n?"text-white":r.text}`})}),e.jsxs("div",{className:"text-left",children:[e.jsx("p",{className:`text-[9px] font-medium uppercase tracking-wide ${n?"text-white/80":`${r.text} opacity-70`}`,children:t.payment_name}),e.jsxs("div",{className:"flex items-baseline gap-1",children:[e.jsx("span",{className:`text-sm font-bold ${n?"text-white":"text-gray-900 dark:text-white"}`,children:t.count}),e.jsxs("span",{className:`text-[10px] font-medium ${n?"text-white/80":"text-gray-600 dark:text-gray-400"}`,children:[g,t.total.toLocaleString("en-IN",{maximumFractionDigits:0})]})]})]})]},t.payment_type_id)}),ue.length>0&&e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"w-px bg-gray-300 dark:bg-gray-600 mx-1 self-stretch"}),ue.map(t=>{const a=h===t.id;return e.jsxs("button",{type:"button",onClick:()=>ae(t.id),className:`group flex items-center gap-1.5 px-2 py-1.5 rounded-md border transition-all duration-200 ${a?"bg-gradient-to-br from-amber-500 to-orange-500 border-transparent shadow-md":"bg-white dark:bg-gray-800 border-amber-400 border-opacity-40 dark:border-opacity-40 hover:border-opacity-70 hover:shadow-sm"}`,children:[e.jsx("div",{className:`p-1 rounded ${a?"bg-white/20":"bg-amber-50 dark:bg-amber-900/20"}`,children:e.jsx(fe,{className:`w-3 h-3 ${a?"text-white":"text-amber-600"}`})}),e.jsxs("div",{className:"text-left",children:[e.jsx("p",{className:`text-[9px] font-medium uppercase tracking-wide ${a?"text-white/80":"text-amber-600 opacity-70"}`,children:t.name}),e.jsxs("div",{className:"flex items-baseline gap-1",children:[e.jsx("span",{className:`text-sm font-bold ${a?"text-white":"text-gray-900 dark:text-white"}`,children:t.count}),e.jsxs("span",{className:`text-[10px] font-medium ${a?"text-white/80":"text-gray-600 dark:text-gray-400"}`,children:[g,t.total.toLocaleString("en-IN",{maximumFractionDigits:0})]})]})]})]},t.id)})]})]})}),e.jsx("div",{className:"hidden md:block flex-1 min-h-0 overflow-auto bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-md",children:e.jsxs("table",{className:"w-full",children:[e.jsx("thead",{className:"bg-gradient-to-r from-slate-700 to-slate-600 dark:from-gray-700 dark:to-gray-600 sticky top-0 z-10",children:e.jsxs("tr",{children:[e.jsx("th",{className:"px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase",children:"Bill #"}),e.jsx("th",{className:"px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase",children:"Date"}),e.jsx("th",{className:"px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase",children:"Customer"}),e.jsx("th",{className:"px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase",children:"Phone"}),e.jsx("th",{className:"px-2 py-1.5 text-left text-[10px] font-bold text-white uppercase",children:"Payment Type"}),e.jsx("th",{className:"px-2 py-1.5 text-right text-[10px] font-bold text-white uppercase",children:"Amount"}),e.jsx("th",{className:"px-2 py-1.5 text-center text-[10px] font-bold text-white uppercase",children:"Actions"})]})}),e.jsx("tbody",{className:"divide-y divide-gray-200 dark:divide-gray-700",children:oe.map((t,a)=>{const r=t.displayPaymentType||"Unknown",n=ye(r),o=t.paymentCount>1,c=t.isFirstPayment,b=new Set(B.slice(0,K+a+1).map(x=>x.billSequenceNumber)).size;return e.jsxs("tr",{className:`hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors cursor-pointer ${!t.isFirstPayment&&o?"border-t-0":""}`,onClick:()=>t.isFirstPayment&&he(t),children:[e.jsx("td",{className:"px-2 py-1.5 whitespace-nowrap",children:t.isFirstPayment?e.jsxs("div",{className:"flex items-center gap-1 flex-wrap",children:[e.jsx("span",{className:`text-xs font-semibold ${t.status==="cancelled"?"text-gray-400 line-through":"text-gray-700 dark:text-gray-300"}`,children:b}),t.status==="cancelled"&&e.jsx("span",{className:"px-1.5 py-0.5 text-[8px] font-bold text-red-600 bg-red-100 dark:bg-red-900/30 dark:text-red-400 rounded uppercase",children:"Cancelled"}),t.payment_status==="pending"&&t.status!=="cancelled"&&e.jsx("span",{className:"px-1.5 py-0.5 text-[8px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 rounded uppercase",children:"Pending"})]}):e.jsx("span",{className:"text-xs text-gray-400 dark:text-gray-500 pl-2",children:"↳"})}),e.jsx("td",{className:"px-2 py-1.5 whitespace-nowrap",children:t.isFirstPayment?e.jsx("span",{className:"text-xs text-gray-600 dark:text-gray-400",children:new Date(t.created_at).toLocaleDateString("en-IN",{day:"2-digit",month:"2-digit",year:"numeric"})}):e.jsx("span",{className:"text-xs text-gray-400 dark:text-gray-500",children:"-"})}),e.jsx("td",{className:"px-2 py-1.5",children:t.isFirstPayment?e.jsx("span",{className:"text-xs text-gray-700 dark:text-gray-300",children:t.customer_name}):e.jsx("span",{className:"text-xs text-gray-400 dark:text-gray-500",children:"-"})}),e.jsx("td",{className:"px-2 py-1.5",children:t.isFirstPayment?e.jsx("span",{className:"text-xs text-gray-600 dark:text-gray-400",children:t.customer_phone}):e.jsx("span",{className:"text-xs text-gray-400 dark:text-gray-500",children:"-"})}),e.jsx("td",{className:"px-2 py-1.5 whitespace-nowrap",children:e.jsx("span",{className:`inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold text-white bg-gradient-to-r ${n.bg} rounded-full uppercase shadow-sm`,children:r})}),e.jsx("td",{className:"px-2 py-1.5 text-right whitespace-nowrap",children:e.jsxs("span",{className:"text-xs font-bold text-gray-900 dark:text-white",children:[g,t.displayAmount.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})]})}),c?e.jsx("td",{className:"px-2 py-1.5 text-center whitespace-nowrap",rowSpan:t.paymentCount,children:e.jsxs("div",{className:"flex items-center justify-center gap-1 flex-wrap",children:[t.payment_status==="pending"&&e.jsxs("button",{type:"button",onClick:x=>{x.stopPropagation(),pe(t.bill_id,t.bill_number)},className:"inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 rounded transition-all border border-green-300 dark:border-green-700",title:"Mark as Paid",children:[e.jsx(xe,{className:"w-3 h-3"}),"Mark Paid"]}),e.jsxs("button",{type:"button",onClick:x=>{x.stopPropagation(),Se(t.bill_id)},className:"inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-all",title:"Exchange Bill",children:[e.jsx(fe,{className:"w-3 h-3"}),"Exchange"]}),e.jsxs("button",{type:"button",onClick:x=>{x.stopPropagation(),Ce(t.bill_id)},disabled:ce,className:"inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-all disabled:opacity-50 disabled:cursor-not-allowed",title:"Print Bill",children:[e.jsx("svg",{className:"w-3 h-3",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"})}),"Print"]}),e.jsxs("button",{type:"button",onClick:x=>{x.stopPropagation(),me(t)},className:"inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 rounded transition-all",title:"Download PDF",children:[e.jsx("svg",{className:"w-3 h-3",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"})}),"PDF"]}),e.jsxs("button",{type:"button",onClick:x=>{x.stopPropagation(),Te(t.bill_id,t.bill_number)},className:"inline-flex items-center gap-0.5 px-1.5 py-1 text-[10px] font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 rounded transition-all",title:"Cancel Bill",children:[e.jsx(ie,{className:"w-3 h-3"}),"Cancel"]})]})}):null]},`${t.bill_id}-${t.displayPaymentType}-${a}`)})})]})}),e.jsx("div",{className:"md:hidden space-y-3",children:oe.filter(t=>t.isFirstPayment!==!1).map(t=>{var a;return e.jsxs("div",{onClick:()=>he(t),className:"cursor-pointer bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 shadow-sm active:bg-gray-50 dark:active:bg-gray-700 transition-colors",children:[e.jsxs("div",{className:"flex items-start justify-between gap-2 mb-2",children:[e.jsxs("div",{children:[e.jsxs("div",{className:"flex items-center gap-1.5",children:[e.jsxs("p",{className:"text-sm font-semibold text-gray-900 dark:text-white",children:["#",le(t)]}),t.payment_status==="pending"&&t.status!=="cancelled"&&e.jsx("span",{className:"px-1.5 py-0.5 text-[9px] font-bold text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 rounded uppercase",children:"Payment Pending"})]}),e.jsx("p",{className:"text-xs text-gray-500 dark:text-gray-400 mt-0.5",children:t.customer_name||"Walk-in"})]}),e.jsx("span",{className:`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${t.status==="cancelled"?"bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400":"bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"}`,children:t.displayPaymentType??t.payment_type})]}),e.jsxs("div",{className:"flex items-center justify-between text-xs text-gray-500 dark:text-gray-400",children:[e.jsx("span",{children:t.created_at?new Date(t.created_at).toLocaleDateString():""}),e.jsxs("span",{className:"text-sm font-bold text-gray-900 dark:text-white",children:[g,(a=t.displayAmount)==null?void 0:a.toLocaleString()]})]}),t.payment_status==="pending"&&t.status!=="cancelled"&&e.jsxs("div",{className:"mt-2 flex gap-2",children:[e.jsxs("button",{type:"button",onClick:r=>{r.stopPropagation(),pe(t.bill_id,t.bill_number)},className:"flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-bold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 rounded border border-green-300 dark:border-green-700",children:[e.jsx(xe,{className:"w-3.5 h-3.5"})," Mark Paid"]}),e.jsxs("button",{type:"button",onClick:r=>{r.stopPropagation(),me(t)},className:"flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 rounded",children:[e.jsx("svg",{className:"w-3.5 h-3.5",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"})}),"PDF"]})]})]},`${t.bill_id}-${t.displayPaymentType??t.payment_type}`)})}),L>1&&e.jsxs("div",{className:"flex-shrink-0 flex items-center justify-center gap-1 mt-1.5",children:[e.jsx("button",{type:"button",onClick:()=>$(t=>Math.max(1,t-1)),disabled:M===1,className:"px-2.5 py-1 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-[10px] font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed",children:"Previous"}),e.jsx("div",{className:"flex gap-1",children:Array.from({length:L},(t,a)=>a+1).map(t=>e.jsx("button",{type:"button",onClick:()=>$(t),className:`w-7 h-7 rounded-md text-[10px] font-bold transition-all ${M===t?"bg-gradient-to-br from-slate-700 to-slate-600 text-white shadow-md":"bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"}`,children:t},t))}),e.jsx("button",{type:"button",onClick:()=>$(t=>Math.min(L,t+1)),disabled:M===L,className:"px-2.5 py-1 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-[10px] font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed",children:"Next"})]}),e.jsx("div",{className:"flex-shrink-0 mt-1.5 bg-gradient-to-r from-slate-800 to-slate-700 dark:from-gray-800 dark:to-gray-700 rounded-lg border border-slate-600 dark:border-gray-600 shadow-lg px-3 py-2",children:e.jsxs("div",{className:"flex justify-between items-center",children:[e.jsxs("div",{className:"flex items-center gap-6",children:[e.jsxs("div",{children:[e.jsxs("p",{className:"text-slate-400 dark:text-gray-400 text-[10px] uppercase font-medium",children:["Page ",M," of ",L||1]}),e.jsxs("p",{className:"text-slate-300 dark:text-gray-300 text-xs font-semibold",children:[oe.length," items"]})]}),e.jsxs("div",{className:"border-l border-slate-600 pl-6",children:[e.jsx("p",{className:"text-slate-400 dark:text-gray-400 text-[10px] uppercase font-medium",children:"Page Total"}),e.jsxs("p",{className:"text-yellow-400 text-sm font-bold",children:[g,oe.reduce((t,a)=>t+a.displayAmount,0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})]})]})]}),e.jsxs("div",{className:"text-right",children:[e.jsx("p",{className:"text-slate-400 dark:text-gray-400 text-[10px] uppercase font-medium",children:h==="all"?`Grand Total (${p.length} bills)${_!=="all"?` • ${_==="today"?"Today":"Custom"}`:""}`:`${((be=W.find(t=>t.payment_type_id===h))==null?void 0:be.payment_name)||h} (${new Set(B.map(t=>t.bill_id)).size} bills)`}),e.jsxs("p",{className:"text-white text-lg font-bold",children:[g,Pe.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2})]})]})]})})]})]}),d&&e.jsxs("div",{className:"fixed inset-0 z-50 flex justify-end",onClick:()=>D(null),children:[e.jsx("div",{className:"absolute inset-0 bg-black/40 backdrop-blur-sm"}),e.jsxs("div",{className:"relative w-full max-w-md bg-white dark:bg-gray-900 h-full shadow-2xl overflow-y-auto flex flex-col",onClick:t=>t.stopPropagation(),children:[e.jsxs("div",{className:"flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800",children:[e.jsxs("div",{children:[e.jsxs("h2",{className:"text-base font-semibold text-gray-900 dark:text-white",children:["Bill #",le(d)]}),e.jsx("span",{className:`text-xs px-2 py-0.5 rounded-full font-medium ${d.type==="gst"?"bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300":"bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"}`,children:d.type==="gst"?"GST":"Non-GST"})]}),e.jsx("button",{type:"button",onClick:()=>D(null),className:"p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors",children:e.jsx(Ee,{className:"w-5 h-5"})})]}),e.jsxs("div",{className:"px-5 py-4 grid grid-cols-2 gap-3 border-b border-gray-200 dark:border-gray-700",children:[e.jsxs("div",{className:"flex items-start gap-2",children:[e.jsx(Ke,{className:"w-4 h-4 text-gray-400 mt-0.5 shrink-0"}),e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] text-gray-400 uppercase font-medium",children:"Customer"}),e.jsx("p",{className:"text-sm text-gray-800 dark:text-gray-200",children:d.customer_name||"Walk-In"}),d.customer_phone&&e.jsx("p",{className:"text-xs text-gray-500 dark:text-gray-400",children:d.customer_phone})]})]}),e.jsxs("div",{className:"flex items-start gap-2",children:[e.jsx(Xe,{className:"w-4 h-4 text-gray-400 mt-0.5 shrink-0"}),e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] text-gray-400 uppercase font-medium",children:"Date"}),e.jsx("p",{className:"text-sm text-gray-800 dark:text-gray-200",children:new Date(d.created_at).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"})}),e.jsx("p",{className:"text-xs text-gray-500 dark:text-gray-400",children:new Date(d.created_at).toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})})]})]}),e.jsxs("div",{className:"flex items-start gap-2",children:[e.jsx(ke,{className:"w-4 h-4 text-gray-400 mt-0.5 shrink-0"}),e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] text-gray-400 uppercase font-medium",children:"Payment"}),e.jsx("p",{className:"text-sm text-gray-800 dark:text-gray-200",children:d.payment_type?(()=>{const t=d.payment_type;if(typeof t=="string"&&t.trim().startsWith("["))try{const a=JSON.parse(t);return Array.isArray(a)?a.map(r=>`${r.payment_type||r.PAYMENT_TYPE||""}${r.amount||r.AMOUNT?` ${g}${r.amount||r.AMOUNT}`:""}`).join(" + "):t}catch{return t}return t})():"—"})]})]}),d.status==="cancelled"&&e.jsxs("div",{className:"flex items-start gap-2",children:[e.jsx(ie,{className:"w-4 h-4 text-red-400 mt-0.5 shrink-0"}),e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] text-gray-400 uppercase font-medium",children:"Status"}),e.jsx("p",{className:"text-sm text-red-500 font-medium",children:"Cancelled"})]})]})]}),e.jsxs("div",{className:"px-5 py-4 flex-1",children:[e.jsxs("div",{className:"flex items-center gap-2 mb-3",children:[e.jsx(Ze,{className:"w-4 h-4 text-gray-400"}),e.jsx("h3",{className:"text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase",children:"Items"})]}),d.items&&d.items.length>0?e.jsx("div",{className:"space-y-2",children:d.items.map((t,a)=>e.jsxs("div",{className:"flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0",children:[e.jsxs("div",{className:"flex-1 min-w-0",children:[e.jsx("p",{className:"text-sm text-gray-800 dark:text-gray-200 truncate",children:t.product_name}),e.jsxs("p",{className:"text-xs text-gray-500 dark:text-gray-400",children:[t.quantity," × ",g,(t.rate||0).toLocaleString("en-IN"),t.gst_percentage?` + ${t.gst_percentage}% ${S}`:""]})]}),e.jsxs("p",{className:"text-sm font-medium text-gray-800 dark:text-gray-200 shrink-0 ml-3",children:[g,(t.amount||0).toLocaleString("en-IN",{minimumFractionDigits:2})]})]},a))}):e.jsx("p",{className:"text-sm text-gray-400 italic",children:"No item details available"})]}),e.jsxs("div",{className:"px-5 py-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 space-y-2",children:[d.type==="gst"&&d.subtotal!==void 0&&e.jsxs("div",{className:"flex justify-between text-sm text-gray-600 dark:text-gray-400",children:[e.jsx("span",{children:"Subtotal"}),e.jsxs("span",{children:[g,(d.subtotal||0).toLocaleString("en-IN",{minimumFractionDigits:2})]})]}),d.gst_amount!==void 0&&d.gst_amount>0&&e.jsxs("div",{className:"flex justify-between text-sm text-gray-600 dark:text-gray-400",children:[e.jsxs("span",{children:[S," (",d.gst_percentage||0,"%)"]}),e.jsxs("span",{children:[g,(d.gst_amount||0).toLocaleString("en-IN",{minimumFractionDigits:2})]})]}),d.discount_amount!==void 0&&d.discount_amount>0&&e.jsxs("div",{className:"flex justify-between text-sm text-red-500",children:[e.jsxs("span",{children:["Discount ",d.discount_percentage?`(${d.discount_percentage}%)`:""]}),e.jsxs("span",{children:["-",g,(d.discount_amount||0).toLocaleString("en-IN",{minimumFractionDigits:2})]})]}),e.jsxs("div",{className:"flex justify-between text-base font-bold text-gray-900 dark:text-white pt-2 border-t border-gray-200 dark:border-gray-700",children:[e.jsx("span",{children:"Total"}),e.jsxs("span",{children:[g,((d.final_amount??d.total_amount)||0).toLocaleString("en-IN",{minimumFractionDigits:2})]})]}),d.payment_status==="pending"&&d.status!=="cancelled"&&e.jsxs("div",{className:"mt-3 flex items-center justify-between p-2.5 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-700",children:[e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("span",{className:"text-amber-600 dark:text-amber-400 text-sm",children:"⏳"}),e.jsx("span",{className:"text-sm font-semibold text-amber-700 dark:text-amber-400",children:"Payment Pending"})]}),e.jsxs("button",{type:"button",onClick:()=>pe(d.bill_id,d.bill_number),className:"inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition",children:[e.jsx(xe,{className:"w-3.5 h-3.5"}),"Mark Paid"]})]}),e.jsx("div",{className:"mt-3 flex gap-2",children:e.jsxs("button",{type:"button",onClick:()=>me(d),className:"flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold text-purple-700 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 rounded-lg border border-purple-200 dark:border-purple-700 transition",children:[e.jsx("svg",{className:"w-4 h-4",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"})}),"Download PDF"]})})]})]})]}),U&&e.jsxs("div",{className:"fixed inset-0 z-[60] flex items-center justify-center",onClick:()=>j(null),children:[e.jsx("div",{className:"absolute inset-0 bg-black/50 backdrop-blur-sm"}),e.jsxs("div",{className:"relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 border border-gray-200 dark:border-gray-700",onClick:t=>t.stopPropagation(),children:[e.jsxs("div",{className:"flex items-center gap-3 mb-4",children:[e.jsx("div",{className:"w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0",children:e.jsx(ie,{className:"w-5 h-5 text-red-600 dark:text-red-400"})}),e.jsxs("div",{children:[e.jsxs("h3",{className:"text-base font-semibold text-gray-900 dark:text-white",children:["Cancel Bill #",U.billNumber,"?"]}),e.jsx("p",{className:"text-xs text-gray-500 dark:text-gray-400 mt-0.5",children:"This will restore all item quantities to stock."})]})]}),e.jsxs("div",{className:"flex gap-2 mt-5",children:[e.jsx("button",{type:"button",onClick:()=>j(null),className:"flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition",children:"No, Keep Bill"}),e.jsx("button",{type:"button",onClick:De,className:"flex-1 px-4 py-2.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition",children:"Yes, Cancel Bill"})]})]})]})]})}export{Bt as default};
