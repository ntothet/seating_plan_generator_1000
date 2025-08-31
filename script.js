// -----------------------------
// Vollständiger, korrekter JS-Code
// -----------------------------

// Datenmodell
let plan = {
  tables: [],
  guests: ["Hans L.", "Irmgard I.", "Jürgen Z.","Anna T.", "Ben H.", "Sophie M.", "Max H.", "Clara P.", "Jonas L.", "Andreas K.", "Dieter S.", "Ansgar T.", "James T."]
};

const canvas = document.getElementById("sitzplan");
const ctx = canvas.getContext("2d");

// Drag / State
let draggedGuest = null;        // aktuell gezogener Gast-Name
let draggedFrom = null;         // "list" oder {tableId, seatIndex}
let dragOrigin = null;          // original info to restore if needed
let dragX = 0, dragY = 0;

let potentialTable = null;      // candidate when mousedown on a table (for click or drag)
let draggedTable = null;        // actual table being dragged
let tableOffsetX = 0, tableOffsetY = 0;

let selectedTable = null;       // aktuell ausgewählter Tisch

// Rotation
let rotating = false;
let rotateStartAngle = 0;
let rotateStartMouseAngle = 0;

// list-drag (guests)
let listDragActive = false;
let listDragStartX = 0, listDragStartY = 0;
let listDragGuestName = null;

const LIST_DRAG_THRESHOLD = 6;
const TABLE_DRAG_THRESHOLD = 8;

// Hilfsfunktionen
function rotatePoint(x, y, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: x * c - y * s, y: x * s + y * c };
}
function dist(ax,ay,bx,by){ return Math.hypot(ax-bx, ay-by); }

// --- Render Gästeliste ---
function renderGuestList(){
  const ul = document.getElementById("guests");
  ul.innerHTML = "";
  plan.guests.forEach(name=>{
    const li = document.createElement("li");
    li.textContent = name;
    li.style.userSelect = "none";
    // start potential list drag
    li.addEventListener("mousedown", (ev)=>{
      ev.preventDefault();
      listDragActive = true;
      listDragStartX = ev.clientX;
      listDragStartY = ev.clientY;
      listDragGuestName = name;
    });
    ul.appendChild(li);
  });
}

// --- Sitzbubbles (lokal coords) ---
function drawSeatBubbleLocal(x,y,guestName){
  ctx.beginPath();
  ctx.arc(x,y,15,0,2*Math.PI);
  ctx.fillStyle = guestName ? "#cfc" : "#eee";
  ctx.fill();
  ctx.stroke();
  if(guestName){
    ctx.fillStyle="black";
    ctx.font="13px Arial";
    ctx.textAlign="center";
    ctx.fillText(guestName, x, y-20);
  }
}

// --- Zeichne Tisch & berechne Dropzones / UI ---
function drawTable(table){
  ctx.save();
  ctx.translate(table.x, table.y);
  ctx.rotate(table.angle || 0);

  // Größe berechnen & Zeichnen
  if(table.type === "circle"){
    table.radius = 30 + 10 * Math.sqrt(Math.max(1, table.seats));
    ctx.beginPath();
    ctx.arc(0,0,table.radius,0,2*Math.PI);
    ctx.fillStyle="#add8e6"; ctx.fill(); ctx.stroke();
  } else {
    let sideSeats = table.seats;
    if(table.headSeats) sideSeats = Math.max(0, sideSeats-2);
    table.width = Math.max(80, sideSeats * 30);
    table.height = 60;
    ctx.fillStyle="#add8e6";
    ctx.strokeStyle="black";
    ctx.fillRect(-table.width/2, -table.height/2, table.width, table.height);
    ctx.strokeRect(-table.width/2, -table.height/2, table.width, table.height);
  }

  // Name
  ctx.fillStyle="black";
  ctx.font="14px Arial";
  ctx.textAlign="center";
  ctx.fillText(table.name, 0, 5);

  // Seats -> absolute dropzones
  table.dropzones = [];
  let ix = 0;
  if(table.type==="circle"){
    const n = table.seats;
    const sr = table.radius + 30;
    for(let i=0;i<n;i++){
      const ang = (2*Math.PI*i)/n;
      const sx = Math.cos(ang)*sr, sy = Math.sin(ang)*sr;
      drawSeatBubbleLocal(sx, sy, table.guests[ix]);
      const abs = rotatePoint(sx, sy, table.angle || 0);
      table.dropzones[ix] = { x: table.x + abs.x, y: table.y + abs.y, r: 15, seatIndex: ix, tableId: table.id };
      ix++;
    }
  } else {
    const total = table.seats;
    // head seats left/right
    if(table.headSeats && total>=2){
      const lx = -table.width/2 - 25, ly = 0;
      drawSeatBubbleLocal(lx, ly, table.guests[ix]);
      const al = rotatePoint(lx,ly,table.angle||0);
      table.dropzones[ix] = { x: table.x + al.x, y: table.y + al.y, r:15, seatIndex: ix, tableId: table.id }; ix++;
      const rx = table.width/2 + 25, ry = 0;
      drawSeatBubbleLocal(rx, ry, table.guests[ix]);
      const ar = rotatePoint(rx,ry,table.angle||0);
      table.dropzones[ix] = { x: table.x + ar.x, y: table.y + ar.y, r:15, seatIndex: ix, tableId: table.id }; ix++;
    }
    const remaining = total - ix;
    const top = Math.ceil(remaining/2);
    const bottom = Math.floor(remaining/2);
    // top
    for(let i=0;i<top;i++, ix++){
      const sx = -table.width/2 + ((i+1)*(table.width/(top+1)));
      const sy = -table.height/2 - 25;
      drawSeatBubbleLocal(sx, sy, table.guests[ix]);
      const a = rotatePoint(sx,sy,table.angle||0);
      table.dropzones[ix] = { x: table.x + a.x, y: table.y + a.y, r:15, seatIndex: ix, tableId: table.id };
    }
    // bottom
    for(let i=0;i<bottom;i++, ix++){
      const sx = -table.width/2 + ((i+1)*(table.width/(bottom+1)));
      const sy = table.height/2 + 25;
      drawSeatBubbleLocal(sx, sy, table.guests[ix]);
      const a = rotatePoint(sx,sy,table.angle||0);
      table.dropzones[ix] = { x: table.x + a.x, y: table.y + a.y, r:15, seatIndex: ix, tableId: table.id };
    }
  }

  // Selection UI (wenn ausgewählt)
  if(selectedTable && selectedTable.id === table.id){
    const boxW = table.type === "circle" ? table.radius * 3 : table.width;
    const boxH = table.type === "circle" ? table.radius * 3 : table.height;
    const margin = 50;
    ctx.save();
    ctx.rotate(0);
    ctx.strokeStyle = "rgba(80,80,80,0.95)";
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6,4]);
    ctx.strokeRect(-boxW/2 - margin, -boxH/2 - margin, boxW + margin*2, boxH + margin*2);
    ctx.setLineDash([]);

    // Eckhandles (Pfeil)
    const corners = [
      { x: -boxW/2 - margin, y: -boxH/2 - margin },
      { x: boxW/2 + margin, y: -boxH/2 - margin },
      { x: -boxW/2 - margin, y: boxH/2 + margin },
      { x: boxW/2 + margin, y: boxH/2 + margin }
    ];
    ctx.fillStyle = "rgba(120,120,120,0.95)";
    ctx.font = "14px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    table.handles = [];
    corners.forEach((c, idx)=>{
      ctx.beginPath();
      ctx.arc(c.x, c.y, 12, 0, 2*Math.PI); ctx.fill();
      ctx.fillStyle = "white"; ctx.fillText("↻", c.x, c.y); ctx.fillStyle = "rgba(120,120,120,0.95)";
      const a = rotatePoint(c.x, c.y, table.angle || 0);
      table.handles.push({ x: table.x + a.x, y: table.y + a.y, index: idx });
    });

    // Delete (unten mittig)
    const delLocal = { x: 0, y: boxH/2 + margin - 12 };
    ctx.beginPath(); ctx.arc(delLocal.x, delLocal.y, 12, 0, 2*Math.PI); ctx.fillStyle="red"; ctx.fill();
    ctx.fillStyle="white"; ctx.fillText("🗑️", delLocal.x, delLocal.y);
    const delAbs = rotatePoint(delLocal.x, delLocal.y, table.angle||0);
    table.deleteBtn = { x: table.x + delAbs.x, y: table.y + delAbs.y, r: 12 };

    // Add / Remove seats (links / rechts)
    const addLocal = { x: boxW/2 + margin - 12, y: 0 };
    const remLocal = { x: -boxW/2 - margin + 12, y: 0 };
    ctx.beginPath(); ctx.arc(addLocal.x, addLocal.y, 12, 0, 2*Math.PI); ctx.fillStyle="green"; ctx.fill();
    ctx.fillStyle="white"; ctx.fillText("+", addLocal.x, addLocal.y+1);
    ctx.beginPath(); ctx.arc(remLocal.x, remLocal.y, 12, 0, 2*Math.PI); ctx.fillStyle="blue"; ctx.fill();
    ctx.fillStyle="white"; ctx.fillText("-", remLocal.x, remLocal.y+1);
    const addAbs = rotatePoint(addLocal.x, addLocal.y, table.angle||0);
    const remAbs = rotatePoint(remLocal.x, remLocal.y, table.angle||0);
    table.addBtn = { x: table.x + addAbs.x, y: table.y + addAbs.y, r:12 };
    table.removeBtn = { x: table.x + remAbs.x, y: table.y + remAbs.y, r:12 };

    ctx.restore();
  }

  ctx.restore();
}

// --- Render Szene ---
function render(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  plan.tables.forEach(drawTable);

  // ghost für gezogenen Gast
  if(draggedGuest){
    ctx.beginPath();
    ctx.arc(dragX, dragY, 15, 0, 2*Math.PI);
    ctx.fillStyle="#ffc"; ctx.fill(); ctx.stroke();
    ctx.fillStyle="black"; ctx.font="10px Arial"; ctx.textAlign="center";
    ctx.fillText(draggedGuest, dragX, dragY - 20);
  }
}

// ---------------- Events ----------------

// Global mousemove (für list-drag start, rotation and table drag movement)
window.addEventListener("mousemove", (e)=>{
  // list drag (start draggedGuest after threshold)
  if(listDragActive){
    const moved = Math.hypot(e.clientX - listDragStartX, e.clientY - listDragStartY);
    if(!draggedGuest && moved > LIST_DRAG_THRESHOLD){
      draggedGuest = listDragGuestName;
      draggedFrom = "list";
    }
    if(draggedGuest){
      const rect = canvas.getBoundingClientRect();
      dragX = e.clientX - rect.left; dragY = e.clientY - rect.top;
      render();
    }
  }

  // rotating
  if(rotating && selectedTable){
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const ang = Math.atan2(my - selectedTable.y, mx - selectedTable.x);
    selectedTable.angle = rotateStartAngle + (ang - rotateStartMouseAngle);
    render();
    return;
  }

  // handle starting table drag after threshold
  if(potentialTable && !draggedTable){
    const moved = Math.hypot(e.clientX - potentialTable.startClientX, e.clientY - potentialTable.startClientY);
    if(moved > TABLE_DRAG_THRESHOLD){
      draggedTable = potentialTable.table;
      const rect = canvas.getBoundingClientRect();
      const startMx = potentialTable.startClientX - rect.left;
      const startMy = potentialTable.startClientY - rect.top;
      tableOffsetX = startMx - draggedTable.x;
      tableOffsetY = startMy - draggedTable.y;
      potentialTable = null;
    }
  }

  if(draggedTable){
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    draggedTable.x = mx - tableOffsetX;
    draggedTable.y = my - tableOffsetY;
    render();
  }
});

// mousedown on canvas: buttons / rotation handles / seat pickup / potential table
canvas.addEventListener("mousedown", (e)=>{
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;

  // Buttons (sofort ausführen) wenn selectedTable vorhanden
  if(selectedTable){
    if(selectedTable.deleteBtn && dist(mx,my,selectedTable.deleteBtn.x,selectedTable.deleteBtn.y) <= selectedTable.deleteBtn.r + 3){
      selectedTable.guests.forEach(g=>{ if(g) plan.guests.push(g); });
      plan.tables = plan.tables.filter(t=>t.id !== selectedTable.id);
      selectedTable = null;
      renderGuestList(); render();
      return;
    }
    if(selectedTable.addBtn && dist(mx,my,selectedTable.addBtn.x,selectedTable.addBtn.y) <= selectedTable.addBtn.r + 3){
      selectedTable.seats++;
      selectedTable.guests.push(null);
      render();
      return;
    }
    if(selectedTable.removeBtn && dist(mx,my,selectedTable.removeBtn.x,selectedTable.removeBtn.y) <= selectedTable.removeBtn.r + 3){
      if(selectedTable.seats > 1){
        const removed = selectedTable.guests.pop();
        selectedTable.seats--;
        if(removed) plan.guests.push(removed);
        renderGuestList(); render();
      }
      return;
    }
  }

  // rotation handles (of selected)
  if(selectedTable && selectedTable.handles){
    for(const h of selectedTable.handles){
      if(dist(mx,my,h.x,h.y) <= 14){
        rotating = true;
        rotateStartAngle = selectedTable.angle || 0;
        rotateStartMouseAngle = Math.atan2(my - selectedTable.y, mx - selectedTable.x);
        return;
      }
    }
  }

  // seat pickup (immediate)
  for(const t of plan.tables){
    for(const dz of t.dropzones){
      if(dz && dist(mx,my,dz.x,dz.y) <= dz.r){
        const g = t.guests[dz.seatIndex];
        if(g){
          draggedGuest = g;
          draggedFrom = { tableId: t.id, seatIndex: dz.seatIndex };
          dragOrigin = { ...draggedFrom };
          t.guests[dz.seatIndex] = null;
          dragX = mx; dragY = my;
          listDragActive = true;
          listDragGuestName = g;
          renderGuestList();
          render();
          return;
        }
      }
    }
  }

  // potential table (for click or drag)
  potentialTable = null;
  for(const t of plan.tables){
    let hit = false;
    if(t.type === "circle"){
      hit = dist(mx,my,t.x,t.y) <= (t.radius || 40) + 10;
    } else {
      const w = t.width || 100, h = t.height || 60;
      if(mx >= t.x - w/2 && mx <= t.x + w/2 && my >= t.y - h/2 && my <= t.y + h/2) hit = true;
    }
    if(hit){
      potentialTable = { table: t, startClientX: e.clientX, startClientY: e.clientY };
      break;
    }
  }
});

// mouseup (global): handle drop guest / finish drag or select
window.addEventListener("mouseup", (e)=>{
  if(listDragActive && !draggedGuest){
    listDragActive = false; listDragGuestName = null;
  }

  if(rotating){
    rotating = false; render(); return;
  }

  if(draggedGuest){
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    let placed = false;

    for(const t of plan.tables){
      for(const dz of t.dropzones){
        if(dz && dist(mx,my,dz.x,dz.y) <= dz.r){
          const targetGuest = t.guests[dz.seatIndex];
          if(!targetGuest){
            t.guests[dz.seatIndex] = draggedGuest;
          } else {
            // Tausch oder zurück in Liste
            if(draggedFrom !== "list" && typeof draggedFrom === "object"){
              const fromT = plan.tables.find(x => x.id === draggedFrom.tableId);
              if(fromT) fromT.guests[draggedFrom.seatIndex] = targetGuest;
            } else {
              plan.guests.push(targetGuest);
            }
            t.guests[dz.seatIndex] = draggedGuest;
          }
          plan.guests = plan.guests.filter(g => g !== draggedGuest);
          placed = true;
          break;
        }
      }
      if(placed) break;
    }

    if(!placed){
      // zurück in Gästeliste, egal ob vom Tisch oder Liste
      if(!plan.guests.includes(draggedGuest)) plan.guests.push(draggedGuest);
    }

    draggedGuest = null; draggedFrom = null; dragOrigin = null;
    listDragActive = false; listDragGuestName = null;
    renderGuestList(); render();
    return;
  }

  if(draggedTable){
    draggedTable = null; potentialTable = null; render(); return;
  }

  if(potentialTable && potentialTable.table){
    selectedTable = potentialTable.table;
    potentialTable = null;
    render();
    return;
  }

  selectedTable = null;
  potentialTable = null;
  render();
});


// canvas click: used for button clicks as backup (most button actions are handled on mousedown)
canvas.addEventListener("click", (e)=>{
  if(!selectedTable) return;
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  if(selectedTable.deleteBtn && dist(mx,my,selectedTable.deleteBtn.x,selectedTable.deleteBtn.y) <= selectedTable.deleteBtn.r + 3){
    selectedTable.guests.forEach(g => { if(g) plan.guests.push(g); });
    plan.tables = plan.tables.filter(t => t.id !== selectedTable.id);
    selectedTable = null;
    renderGuestList(); render();
    return;
  }
  if(selectedTable.addBtn && dist(mx,my,selectedTable.addBtn.x,selectedTable.addBtn.y) <= selectedTable.addBtn.r + 3){
    selectedTable.seats++; selectedTable.guests.push(null); render(); return;
  }
  if(selectedTable.removeBtn && dist(mx,my,selectedTable.removeBtn.x,selectedTable.removeBtn.y) <= selectedTable.removeBtn.r + 3){
    if(selectedTable.seats > 1){
      const removed = selectedTable.guests.pop();
      selectedTable.seats--;
      if(removed) plan.guests.push(removed);
      renderGuestList(); render();
    }
    return;
  }
});

// Table creation UI (keine Änderung nötig)
const tableTypeSel = document.getElementById("tableType");
const rectHeadLabel = document.getElementById("rectHeadLabel");
tableTypeSel.addEventListener("change", ()=> {
  rectHeadLabel.style.display = tableTypeSel.value === "rect" ? "block" : "none";
});
document.getElementById("addTable").addEventListener("click", ()=>{
  const name = document.getElementById("tableName").value || "Tisch";
  const type = document.getElementById("tableType").value;
  const seats = Math.max(1, parseInt(document.getElementById("seatCount").value,10) || 1);
  const headSeats = document.getElementById("headSeats").checked;
  const newT = { id: Date.now(), name, type, x: canvas.width/2, y: canvas.height/2, seats, guests: Array(seats).fill(null), headSeats, angle: 0 };
  plan.tables.push(newT);
  render();
  renderGuestList();
});

// Guard: cancel list-drag on mouseup outside canvas
window.addEventListener("mouseup", (e)=>{
  if(listDragActive && !draggedGuest && e.target !== canvas){
    listDragActive = false; listDragGuestName = null;
  }
});

document.getElementById("printCanvasBtn").addEventListener("click", () => {
  const canvas = document.getElementById("sitzplan");
  const dataURL = canvas.toDataURL(); // Canvas in Bild umwandeln
  const printWindow = window.open("", "_blank"); // neuer Tab
  printWindow.document.write(`
    <html>
      <head><title>Sitzplan</title></head>
      <body style="margin:0; display:flex; justify-content:center; align-items:center; height:100vh; background:#fff;">
        <img src="${dataURL}" style="max-width:100%; max-height:100%;">
      </body>
    </html>
  `);
});

printListBtn.addEventListener("click", ()=>{
  let html = "<html><head><title>Gästeliste</title></head><body style='font-family:Arial,sans-serif;'>";
  plan.tables.forEach(table => {
    html += `<strong>${table.name}</strong><br>`;
    table.guests.forEach(g => {
      if(g) html += `&nbsp;&nbsp;- ${g}<br>`;
    });
    html += "<br>"; // Abstand zum nächsten Tisch
  });
  html += "</body></html>";

  const w = window.open("", "_blank");
  w.document.write(html);
  w.document.close();
});

// Doppelklick: Tischnamen ändern
canvas.addEventListener("dblclick", (e)=>{
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;

  for(const t of plan.tables){
    let hit = false;
    if(t.type === "circle"){
      hit = dist(mx,my,t.x,t.y) <= (t.radius || 40);
    } else {
      const w = t.width || 100, h = t.height || 60;
      if(mx >= t.x - w/2 && mx <= t.x + w/2 && my >= t.y - h/2 && my <= t.y + h/2) hit = true;
    }
    if(hit){
      const newName = prompt("Neuer Tischname:", t.name);
      if(newName && newName.trim() !== ""){
        t.name = newName.trim();
        render(); // Canvas neu zeichnen
      }
      break; // nur erster getroffener Tisch
    }
  }
});

// init render
renderGuestList();
render();
