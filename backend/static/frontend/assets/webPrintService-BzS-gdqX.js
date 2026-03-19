const A={PAPER_WIDTH:"58mm",FONT_SIZE:"8pt",FONT_SIZE_LARGE:"11pt",FONT_SIZE_XLARGE:"13pt",FONT_SIZE_SMALL:"7pt",ITEM_NAME_MAX:18};function F(t){let s=t;!t.endsWith("Z")&&!t.includes("+")&&!t.includes("T")?s=t+"T00:00:00Z":t.includes("T")&&!t.endsWith("Z")&&!t.includes("+")&&(s=t+"Z");const c=new Date(s),n={timeZone:"Asia/Kolkata",day:"2-digit",month:"2-digit",year:"numeric"};return new Intl.DateTimeFormat("en-GB",n).format(c)}function P(t){let s=t;return t.includes("T")&&!t.endsWith("Z")&&!t.includes("+")&&(s=t+"Z"),new Date(s).toLocaleTimeString("en-US",{timeZone:"Asia/Kolkata",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:!0})}function _(t){return t<100?t.toFixed(2):Math.round(t).toString()}function d(t){return t.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;")}function x(t,s,c=!0){const{PAPER_WIDTH:n,FONT_SIZE:a,FONT_SIZE_LARGE:i,FONT_SIZE_XLARGE:o,FONT_SIZE_SMALL:r,ITEM_NAME_MAX:w}=A,$=t.items.length;t.items.reduce((e,m)=>e+Number(m.quantity),0);const g=Number(t.subtotal)||0,u=Number(t.gst_amount)||0,p=Number(t.negotiable_amount)||0,S=Number(t.discount_amount)||0,v=p>0?p:S;t.type;let h=0;for(const e of t.items){const m=Number(e.mrp)>0?Number(e.mrp):Number(e.rate),l=Number(e.rate),f=Number(e.quantity);m>l&&(h+=(m-l)*f)}h+=v;let y="";try{const e=JSON.parse(t.payment_type);Array.isArray(e)&&e.length>0?y=e.map(m=>`${m.payment_type}: ${parseFloat(String(m.amount)).toFixed(2)}`).join(", "):y=d(t.payment_type)}catch{y=d(t.payment_type)}let T=0,N=0;for(const e of t.items){const m=Number(e.mrp)>0?Number(e.mrp):Number(e.rate),l=Number(e.rate),f=Number(e.quantity);T+=m*f,N+=l*f}let E="";for(const e of t.items){const m=e.product_name,l=Number(e.mrp)>0?Number(e.mrp):Number(e.rate),f=Number(e.rate),R=Number(e.quantity),z=Number(e.amount);E+=`
    <div class="item-row">
      <span class="col-product">${d(m)}</span>
      <span class="col-qty">${R}</span>
      <span class="col-mrp">${_(l)}</span>
      <span class="col-rate">${_(f)}</span>
      <span class="col-amt">${_(z)}</span>
    </div>`}let b="";if(t.type==="gst"&&u>0){const e=u/2,m=u/2,l=g;b=`GST ${t.gst_percentage||18}% on ${l.toFixed(2)} - CGST =${e.toFixed(2)} - SGST = ${m.toFixed(2)}`}return`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Bill #${t.bill_number}</title>
  <style>
    @page { size: 80mm auto; margin: 0mm; }
    @media print {
      html, body { margin: 0 !important; padding: 0 !important; }
      body { width: ${n} !important; margin: 0 auto !important; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      width: ${n};
      max-width: ${n};
      background: #fff;
      color: #000;
      font-size: ${a};
      font-weight: 600;
      line-height: 1.3;
      padding: 1mm 0mm;
      margin: 0 auto;
      letter-spacing: -0.3px;
      -webkit-font-smoothing: none;
      -moz-osx-font-smoothing: grayscale;
    }
    .center { text-align: center; }
    .bold { font-weight: 700; }
    .dashed { border-bottom: 1px dashed #000; margin: 1.5mm 0; }
    .row { margin-bottom: 0.5mm; }
    .row-flex { display: flex; justify-content: space-between; margin-bottom: 0.5mm; }
    .item-header, .item-row {
      display: flex;
      font-size: ${r};
      margin-bottom: 0.5mm;
    }
    .item-header { font-weight: 700; }
    .col-product { flex: 1; min-width: 0; word-wrap: break-word; word-break: break-word; overflow-wrap: break-word; }
    .col-qty { width: 8mm; text-align: center; flex-shrink: 0; }
    .col-mrp { width: 10mm; text-align: right; flex-shrink: 0; }
    .col-rate { width: 10mm; text-align: right; flex-shrink: 0; }
    .col-amt { width: 12mm; text-align: right; font-weight: 700; flex-shrink: 0; }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="center bold" style="font-size: ${o}; margin-bottom: 1mm;">${d(s.client_name||"Business Name")}</div>
  ${s.address?`<div class="center" style="font-size: ${r};">${d(s.address).replace(/\n/g,"<br>")}</div>`:""}
  ${s.address2?`<div class="center" style="font-size: ${r};">${d(s.address2)}</div>`:""}
  ${s.phone?`<div class="center" style="font-size: ${r};">${d(s.phone)}</div>`:""}
  ${s.gstin?`<div class="center bold" style="font-size: ${r};">GST NO : ${d(s.gstin)}</div>`:""}
  <div class="dashed"></div>

  <!-- Bill Info -->
  <div style="font-size: ${r};">
    <div class="row-flex"><span><strong>Bill No  :</strong> ${t.bill_number}</span><span>${y}</span></div>
    <div class="row"><strong>Date     :</strong> ${F(t.created_at)}</div>
    <div class="row"><strong>Time     :</strong> ${P(t.created_at)}</div>
  </div>
  <div class="dashed"></div>

  <!-- Items Header -->
  <div class="item-header">
    <span class="col-product">Product</span>
    <span class="col-qty">Qty</span>
    <span class="col-mrp">MRP</span>
    <span class="col-rate">Rate</span>
    <span class="col-amt">Amt</span>
  </div>
  <div class="dashed"></div>

  <!-- Items -->
  ${E}
  <div class="dashed"></div>

  <!-- Totals Summary -->
  <div style="font-size: ${r};">
    <div class="row-flex"><span>Total Items : ${$}</span><span style="font-size: 14px; font-weight: 700;">Total Amount : ${g.toFixed(2)}</span></div>
    <div class="row">Total Mrp : ${T.toFixed(2)}</div>
    <div class="row">Total Rate : ${N.toFixed(2)}</div>
    ${v>0?`<div class="row"><span style="font-size: ${i}; font-weight: 700;">Total Discount : ${v.toFixed(2)}</span></div>`:""}
  </div>
  <div class="dashed"></div>

  <!-- GST Breakdown (if GST bill) -->
  ${b?`<div class="center" style="font-size: ${r};">${b}</div>`:""}

  <!-- Savings Box -->
  ${h>0?`
  <div style="text-align: center; margin: 2mm 0; padding: 1.5mm; border: 1px dashed #000;">
    <div style="font-size: ${r};">TODAY'S SAVINGS</div>
    <div style="font-size: ${i}; font-weight: bold; margin: 0.5mm 0;">&#8377;${h.toFixed(2)}</div>
    <div style="font-size: ${r};">You saved compared to MRP!</div>
  </div>`:""}

  <!-- Footer -->
  <div class="center bold" style="font-size: ${a}; margin-top: 2mm;">${d(s.receipt_footer||"Sorry, No Exchange / No Refund")}</div>
</body>
</html>`}function k(t,s,c=!0){var n;try{const a=x(t,s,c),i=document.getElementById("print-iframe");i&&i.remove();const o=document.createElement("iframe");o.id="print-iframe",o.style.position="fixed",o.style.right="0",o.style.bottom="0",o.style.width="0",o.style.height="0",o.style.border="none",o.style.visibility="hidden",document.body.appendChild(o);const r=o.contentDocument||((n=o.contentWindow)==null?void 0:n.document);if(!r)return{success:!1,method:"browser",message:"Could not access iframe document for printing."};let w=!1;const $=()=>{var g,u;if(!w){w=!0;try{(g=o.contentWindow)==null||g.focus(),(u=o.contentWindow)==null||u.print()}catch(p){console.error("Print error:",p)}setTimeout(()=>{const p=document.getElementById("print-iframe");p&&p.remove()},5e3)}};return r.open(),r.write(a),r.close(),setTimeout($,100),{success:!0,method:"browser",message:"Print dialog opened successfully"}}catch(a){return{success:!1,method:"browser",message:a instanceof Error?a.message:"Print failed"}}}function D(t,s,c=!0){try{const n=x(t,s,c),a=new Blob([n],{type:"text/html"}),i=URL.createObjectURL(a);return window.open(i,"_blank")?(setTimeout(()=>URL.revokeObjectURL(i),1e4),{success:!0,method:"browser",message:"PDF opened in new tab"}):{success:!1,method:"browser",message:"Could not open new tab. Please allow popups for this site."}}catch(n){return{success:!1,method:"browser",message:n instanceof Error?n.message:"PDF generation failed"}}}function I(t,s){try{const c=t.type==="gst"?t.final_amount:t.total_amount,n=F(t.created_at),a=encodeURIComponent(`*${s.client_name||"Bill"}*
━━━━━━━━━━━━━━━
Bill No: ${t.bill_number}
Date: ${n}
━━━━━━━━━━━━━━━
Items: ${t.items.length}
Total: Rs. ${Math.round(Number(c))}
Payment: ${t.payment_type}
━━━━━━━━━━━━━━━
Thank you for your purchase!`),i=t.customer_phone?t.customer_phone.replace(/\D/g,""):"",o=i?`https://wa.me/${i.startsWith("91")?i:"91"+i}?text=${a}`:`https://wa.me/?text=${a}`;return window.open(o,"_blank"),{success:!0,method:"browser",message:"WhatsApp opened"}}catch(c){return{success:!1,method:"browser",message:c instanceof Error?c.message:"WhatsApp share failed"}}}const Z={generateReceiptHtml:x,printBill:k,downloadPdf:D,shareWhatsApp:I,RECEIPT_CONFIG:A};export{Z as default,D as downloadPdf,x as generateReceiptHtml,k as printBill,I as shareWhatsApp};
