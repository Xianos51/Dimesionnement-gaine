// ==
// CALCULATEUR & EDITEUR DE RESEAU DE VENTILATION

// Version automatisee avec calcul segment par segment

// ==
// === BASE DE DONNEES ZETA === 

const ZETA_DB = {

    coude_90: {n:'Coude 90',z:0.25},

    coude_45: {n:'Coude 45',z:0.15},

    te_droit: {n:'T passage direct',z:0.1},

    te_branche: {n:'T sortie branche',z:0.5},

    reduction_abrupte: {n:'Reduction abrupte',z:0.5},

    reduction_conique: {n:'Reduction conique',z:0.1},

    expansion_abrupte: {n:'Expansion abrupte',z:1.0},

    grille: {n:'Grille',z:0.5},

    vanne: {n:'Vanne',z:0.2}

};

// === VARIABLES GLOBALES === 

const diamStandards = [100,125,160,200,250,315,400,500,630,800,1000,1250];

let diamDispo = [...diamStandards];

let nextRowId = 2;

let editorTool = 'draw';

let canvasElement = null;

const svgNS = 'http://www.w3.org/2000/svg';

let SCALE = 20;

let GRID_SIZE = 20;

let drawnPaths = [];

let nodes = [];

let segments = [];

let selectedSegment = null;

let exitCounter = 0;

let exitLabels = {};

let isDrawing = false;

let currentPath = null;

let startPoint = null;

let isHorizontal = null;

let caissonNode = null;

let caissonMode = 'soufflage'; // 'soufflage' ou 'aspiration'

// Variables pour le calcul des débits
let nodeFlows = {};
let childrenMap = {};

// === INITIALISATION === 

document.addEventListener('DOMContentLoaded', function() {

    afficherDiametres();

    calculerTout();

    canvasElement = document.getElementById('drawingCanvas');

    if(canvasElement) {

        initEditor();

    }

});

// ==
// FONCTIONS CALCULATEUR

// ==
function afficherDiametres() {

    const c = document.getElementById('diametresContainer');

    c.innerHTML = '';

    diamDispo.sort((a,b)=>a-b).forEach(d=>{

        const b = document.createElement('span');

        b.className='badge badge-success';

        b.textContent=d+' mm';

        b.style.cursor='pointer';

        b.onclick=()=>supprimerDiametre(d);

        c.appendChild(b);

    });

}

function ajouterDiametre() {

    const inp = document.getElementById('newDiametre');

    const v = parseFloat(inp.value);

    if(v && v>0 && !diamDispo.includes(v)) {

        diamDispo.push(v);

        afficherDiametres();

        inp.value='';

    }

}

function supprimerDiametre(d) {

    if(diamStandards.includes(d) && !confirm('Supprimer ce diametre standard?')) return;

    diamDispo = diamDispo.filter(x=>x!==d);

    afficherDiametres();

}

function toggleRectFields(cb) {

    const row = cb.closest('tr');

    const a = row.querySelector('.coteA-input');

    const b = row.querySelector('.coteB-input');

    if(cb.checked) {

        a.disabled=false;

        calculerCoteBForRow(row);

    } else {

        a.disabled=true;

        b.value='';

    }

}

function calculerCoteBForRow(row) {

    if(!row.querySelector('.isRect-check').checked) return;

    const debit = parseFloat(row.querySelector('.debit-input').value)||0;

    const vmax = parseFloat(row.querySelector('.vitesse-input').value)||4;

    const a = parseFloat(row.querySelector('.coteA-input').value)||500;

    if(debit<=0) {

        row.querySelector('.coteB-input').value='';

        return;

    }

    const Q=debit/3600;

    const section=Q/vmax;

    const b=(section*1e6)/a;

    row.querySelector('.coteB-input').value=Math.round(b);

}

function ajouterLigne() {

    const tbody = document.getElementById('debitsBody');

    const row = document.createElement('tr');

    row.innerHTML='<td>'+nextRowId+'</td>'+

        '<td><input type="number" class="debit-input" value="300" min="10" max="100000"></td>'+

        '<td><input type="number" class="vitesse-input" value="4" min="1" max="20" step="0.1"></td>'+

        '<td><input type="number" class="longueur-input" value="10" min="1" max="1000"></td>'+

        '<td class="checkbox-cell"><input type="checkbox" class="isRect-check" onchange="toggleRectFields(this);calculerTout()"></td>'+

        '<td><input type="number" class="coteA-input" value="500" min="10" max="5000" disabled oninput="calculerCoteBForRow(this.closest(\'tr\'));calculerTout()"></td>'+

        '<td><input type="number" class="coteB-input" readonly></td>'+

        '<td><button class="btn btn-danger btn-sm" onclick="supprimerLigne(this)">X</button></td>';

    tbody.appendChild(row);

    nextRowId++;

}

function supprimerLigne(btn) {

    const row = btn.closest('tr');

    if(document.querySelectorAll('#debitsBody tr').length>1) {

        row.remove();

        document.querySelectorAll('#debitsBody tr').forEach((r,i)=>{r.querySelector('td:first-child').textContent=i+1;});

        nextRowId=document.querySelectorAll('#debitsBody tr').length+1;

        calculerTout();

    }

}

function trouverDiametreCommercial(dt) {

    const ds=[...diamDispo].sort((a,b)=>a-b);

    for(const d of ds) if(d>=dt) return d;

    return ds[ds.length-1];

}

function calculerPertesCharge(v, dh, l, cf, rho) {

    return cf*(l/(dh/1000))*(rho*Math.pow(v,2)/2);

}

function calculerPertesSingulieres(seg, v, rho) {

    if(!seg.accessories || seg.accessories.length===0) return 0;

    return seg.accessories.reduce((sum,acc)=>sum + ((acc.zeta||ZETA_DB[acc.type]?.z||0) * (rho * Math.pow(v,2) / 2)), 0);

}

function formaterNombre(v, d=2) {

    return v.toFixed(d).replace('.', ',');

}

function getStatutBadge(vr, vm) {

    const r=vr/vm;

    if(r<=1) return '<span class="badge badge-success">Optimal</span>';

    if(r<=1.2) return '<span class="badge badge-warning">'+formaterNombre(r*100-100)+'% au-dessus</span>';

    return '<span class="badge badge-danger">'+formaterNombre(r*100-100)+'% au-dessus</span>';

}

function calculerLigne(debit, vm, l, cf, rho, isRect, a) {

    const Q=debit/3600;

    if(isRect) {

        const sideA=parseFloat(a)||500;

        const section=Q/vm;

        const sideB=(section*1e6)/sideA;

        const perim=2*(sideA+sideB)/1000;

        const dh=(4*section)/perim*1000;

        const vr=Q/section;

        return {debit,vm,type:'rectangulaire',coteA:sideA,coteB:sideB,section:section*1e6,diametreHydraulique:dh,vitesseReelle:vr,pertesCharge:calculerPertesCharge(vr,dh,l,cf,rho)};

    } else {

        const dt=Math.sqrt((4*Q)/(Math.PI*vm))*1000;

        const dc=trouverDiametreCommercial(dt);

        const r=dc/2000;

        const section=Math.PI*Math.pow(r,2);

        const vr=Q/section;

        return {debit,vm,type:'circulaire',diametreTheorique:dt,diametreCommercial:dc,section:section*1e6,vitesseReelle:vr,pertesCharge:calculerPertesCharge(vr,dc,l,cf,rho)};

    }

}

function afficherResultats(results) {

    const container = document.getElementById('resultatsContainer');

    if(results.length===0) {

        container.innerHTML='<p class="center-text">Saisissez des debits et cliquez sur Calculer.</p>';

        return;

    }

    let html='<table><thead><tr><th>Ligne</th><th>Debit</th><th>Type</th><th>Diametre</th><th>Vitesse</th><th>Pertes Charge</th><th>Statut</th></tr></thead><tbody>';

    results.forEach(r=>{

        const typeStr = r.type==='rectangulaire' ? 'Rect '+r.coteA+'x'+Math.round(r.coteB) : 'O '+Math.round(r.diametreCommercial);

        html+='<tr><td>'+r.ligne+'</td><td>'+formaterNombre(r.debit)+' m3/h</td><td>'+typeStr+' mm</td><td>'+formaterNombre(r.vitesseReelle,1)+' m/s</td><td>'+formaterNombre(r.pertesCharge,1)+' Pa</td><td>'+getStatutBadge(r.vitesseReelle,r.vm)+'</td></tr>';

    });

    html+='</tbody></table>';

    container.innerHTML=html;

}

function calculerTout() {

    const rows=document.querySelectorAll('#debitsBody tr');

    const results=[];

    const vm=parseFloat(document.getElementById('vitesseMax').value)||4;

    const cf=parseFloat(document.getElementById('coeffFrottement').value)||0.02;

    const len=parseFloat(document.getElementById('longueurGaine').value)||10;

    const rho=parseFloat(document.getElementById('densiteAir').value)||1.225;

    rows.forEach(row=>{

        const debit=parseFloat(row.querySelector('.debit-input').value)||0;

        const vmax=parseFloat(row.querySelector('.vitesse-input').value)||vm;

        const l=parseFloat(row.querySelector('.longueur-input').value)||len;

        const isRect=row.querySelector('.isRect-check').checked;

        const ca=isRect ? (parseFloat(row.querySelector('.coteA-input').value)||500) : null;

        if(debit>0) {

            const r=calculerLigne(debit,vmax,l,cf,rho,isRect,ca);

            results.push({...r,ligne:row.querySelector('td:first-child').textContent,isRect});

        }

    });

    afficherResultats(results);

}

function calculerSelection() { calculerTout(); }

function exporterCSV() {

    const rows=document.querySelectorAll('#debitsBody tr');

    let csv='Ligne,Debit (m3/h),Vitesse max (m/s),Longueur (m),Rectangulaire,Cote A (mm),Cote B (mm)\n';

    rows.forEach((row,i)=>{

        csv+=(i+1)+',';

        csv+=row.querySelector('.debit-input').value+',';

        csv+=row.querySelector('.vitesse-input').value+',';

        csv+=row.querySelector('.longueur-input').value+',';

        csv+=row.querySelector('.isRect-check').checked+',';

        csv+=row.querySelector('.coteA-input').value+',';

        csv+=row.querySelector('.coteB-input').value+'\n';

    });

    const blob = new Blob([csv], {type: 'text/csv'});

    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');

    a.href=url;

    a.download='debits_ventilation.csv';

    a.click();

}

function reinitialiser() {

    if(confirm('Etes-vous sur de vouloir tout reinitialiser?')) {

        const tbody = document.getElementById('debitsBody');

        tbody.innerHTML='<tr><td>1</td>'+

            '<td><input type="number" class="debit-input" value="300" min="10" max="100000"></td>'+

            '<td><input type="number" class="vitesse-input" value="4" min="1" max="20" step="0.1"></td>'+

            '<td><input type="number" class="longueur-input" value="10" min="1" max="1000"></td>'+

            '<td class="checkbox-cell"><input type="checkbox" class="isRect-check" onchange="toggleRectFields(this);calculerTout()"></td>'+

            '<td><input type="number" class="coteA-input" value="500" min="10" max="5000" disabled oninput="calculerCoteBForRow(this.closest(\'tr\'));calculerTout()"></td>'+

            '<td><input type="number" class="coteB-input" readonly></td>'+

            '<td><button class="btn btn-danger btn-sm" onclick="supprimerLigne(this)">X</button></td></tr>';

        nextRowId=2;

        calculerTout();

        afficherDiametres();

        clearDrawing();

    }

}

function dessinerReseau() { switchMode('editeur'); }

function setCaissonMode(mode) {
    caissonMode = mode;
    if(caissonNode) {
        calculateFlowRatesInverse();
    }
}

// ==
// FONCTIONS EDITEUR

// ==
function initEditor() {

    if(!canvasElement) return;

    const svg = canvasElement;

    svg.innerHTML='';

    svg.setAttribute('width', '100%');

    svg.setAttribute('height', '100%');

    drawGrid(svg);

    setupOrthogonalDrawingEvents();

}

function drawGrid(svg) {

    const width = svg.clientWidth || 800;

    const height = svg.clientHeight || 600;

    for(let x=0; x<=width; x+=GRID_SIZE) {

        const line = document.createElementNS(svgNS, 'line');

        line.setAttribute('x1', x);

        line.setAttribute('y1', 0);

        line.setAttribute('x2', x);

        line.setAttribute('y2', height);

        line.setAttribute('class', 'grid-line');

        svg.appendChild(line);

    }

    for(let y=0; y<=height; y+=GRID_SIZE) {

        const line = document.createElementNS(svgNS, 'line');

        line.setAttribute('x1', 0);

        line.setAttribute('y1', y);

        line.setAttribute('x2', width);

        line.setAttribute('y2', y);

        line.setAttribute('class', 'grid-line');

        svg.appendChild(line);

    }

}

function snapToGrid(x, y) {

    return {x: Math.round(x / GRID_SIZE) * GRID_SIZE, y: Math.round(y / GRID_SIZE) * GRID_SIZE};

}

function setupOrthogonalDrawingEvents() {

    const svg = canvasElement;

    svg.addEventListener('mousedown', handleMouseDown);

    svg.addEventListener('mousemove', handleMouseMove);

    svg.addEventListener('mouseup', handleMouseUp);

    svg.addEventListener('mouseleave', handleMouseUp);

}

// Compteur pour les noms de segments

let segmentCounter = 0;

function handleMouseDown(evt) {

    if(editorTool !== 'draw' && editorTool !== 'entry' && editorTool !== 'exit') return;

    const pt = svgPoint(evt);

    const snapped = snapToGrid(pt.x, pt.y);

    isDrawing = true;

    startPoint = {x: snapped.x, y: snapped.y};

    if(editorTool === 'entry') {

        createSpecialPoint(snapped.x, snapped.y, 'entry');

        isDrawing = false;

        return;

    }

    if(editorTool === 'exit') {

        createSpecialPoint(snapped.x, snapped.y, 'exit');

        isDrawing = false;

        return;

    }

    currentPath = document.createElementNS(svgNS, 'path');

    currentPath.setAttribute('class', 'drawn-path');

    currentPath.setAttribute('d', 'M '+snapped.x+' '+snapped.y);

    currentPath.setAttribute('stroke', '#ff0000');

    currentPath.setAttribute('stroke-width', '5');

    currentPath.setAttribute('fill', 'none');

    currentPath.setAttribute('stroke-linecap', 'round');

    currentPath.setAttribute('stroke-linejoin', 'round');

    canvasElement.appendChild(currentPath);

    drawnPaths.push(currentPath);

}

function handleMouseMove(evt) {

    if(!isDrawing || !currentPath || !startPoint) return;

    const pt = svgPoint(evt);

    const snapped = snapToGrid(pt.x, pt.y);

    if(!isHorizontal) {

        if(Math.abs(snapped.x - startPoint.x) > Math.abs(snapped.y - startPoint.y)) {

            isHorizontal = true;

        } else if(Math.abs(snapped.y - startPoint.y) > 0) {

            isHorizontal = false;

        } else {

            return;

        }

    }

    let newX = snapped.x, newY = snapped.y;

    if(isHorizontal) {

        newY = startPoint.y;

    } else {

        newX = startPoint.x;

    }

    currentPath.setAttribute('d', 'M '+startPoint.x+' '+startPoint.y+' L '+newX+' '+newY);

}

function handleMouseUp(evt) {

    if(!isDrawing || !currentPath || !startPoint) return;

    isDrawing = false;

    const pt = svgPoint(evt);

    const snapped = snapToGrid(pt.x, pt.y);

    let endX = snapped.x, endY = snapped.y;

    if(isHorizontal) {

        endY = startPoint.y;

    } else {

        endX = startPoint.x;

    }

    if(endX === startPoint.x && endY === startPoint.y) {

        if(currentPath && currentPath.parentNode) {

            currentPath.parentNode.removeChild(currentPath);

        }

        drawnPaths = drawnPaths.filter(p => p !== currentPath);

        currentPath = null;

        startPoint = null;

        isHorizontal = null;

        return;

    }

    currentPath.setAttribute('d', 'M '+startPoint.x+' '+startPoint.y+' L '+endX+' '+endY);

    const node1 = findOrCreateNode(startPoint.x, startPoint.y);

    const node2 = findOrCreateNode(endX, endY);

    

    segmentCounter++;

    const seg = {

        id: 'S' + segmentCounter,

        name: 'S' + segmentCounter,

        path: currentPath,

        node1: node1,

        node2: node2,

        length: Math.sqrt(Math.pow(endX - startPoint.x, 2) + Math.pow(endY - startPoint.y, 2)) / SCALE,

        accessories: [],

        diameter: 200,

        flowRate: 0,

        direction: null

    };

    segments.push(seg);

    currentPath.addEventListener('click', (e) => {

        e.stopPropagation();

        selectSegment(seg);

    });

    currentPath = null;

    startPoint = null;

    isHorizontal = null;

    detectIntersections();

    calculateFlowRatesInverse();

}

function svgPoint(evt) {

    const svg = canvasElement;

    if(!svg) return {x: 0, y: 0};

    const rect = svg.getBoundingClientRect();

    return {

        x: evt.clientX - rect.left,

        y: evt.clientY - rect.top

    };

}

function findOrCreateNode(x, y) {

    const existing = nodes.find(n => n.x === x && n.y === y);

    if(existing) return existing;

    const node = {id: 'node_'+Date.now(), x, y, type: 'junction', element: null};

    nodes.push(node);

    return node;

}

function createPathElement(x1, y1, x2, y2) {

    const path = document.createElementNS(svgNS, 'path');

    path.setAttribute('d', 'M '+x1+' '+y1+' L '+x2+' '+y2);

    path.setAttribute('class', 'drawn-path');

    path.setAttribute('stroke', '#ff0000');

    path.setAttribute('stroke-width', '5');

    path.setAttribute('fill', 'none');

    path.setAttribute('stroke-linecap', 'round');

    path.setAttribute('stroke-linejoin', 'round');

    return path;

}

function createSpecialPoint(x, y, type) {

    const existing = nodes.find(n => n.x === x && n.y === y);

    if(existing) {

        changeNodeType(existing, type);

        return existing;

    }

    const node = {id: 'node_'+Date.now(), x, y, type: type, element: null};

    nodes.push(node);

    const svg = canvasElement;

    const circle = document.createElementNS(svgNS, 'circle');

    circle.setAttribute('cx', x);

    circle.setAttribute('cy', y);

    circle.setAttribute('r', 10);

    circle.classList.add(type === 'entry' ? 'entry-point' : 'exit-point');

    circle.addEventListener('click', (e) => {

        e.stopPropagation();

        if(type === 'exit') {

            showExitFlowInput(node);

        }

    });

    svg.appendChild(circle);

    node.element = circle;

    if(type === 'exit') {

        exitCounter++;

        const labelId = 'B'+exitCounter;

        exitLabels[node.id] = labelId;

        const text = document.createElementNS(svgNS, 'text');

        text.setAttribute('x', x);

        text.setAttribute('y', y-15);

        text.setAttribute('class', 'exit-label');

        text.textContent = labelId;

        svg.appendChild(text);

        node.label = labelId;

        node.flowRate = 0;

        updateExitsTable();

    } else if(type === 'entry') {

        caissonNode = node;

        const text = document.createElementNS(svgNS, 'text');

        text.setAttribute('x', x);

        text.setAttribute('y', y-15);

        text.setAttribute('class', 'exit-label');

        text.textContent = 'C';

        svg.appendChild(text);

        node.label = 'C';

    }

    return node;

}

function changeNodeType(node, type) {

    node.type = type;

    if(node.element) {

        node.element.classList.remove('entry-point', 'exit-point', 'junction-point');

        node.element.classList.add(type === 'entry' ? 'entry-point' : type === 'exit' ? 'exit-point' : 'junction-point');

    }

    if(type === 'exit') {

        exitCounter++;

        const labelId = 'B'+exitCounter;

        exitLabels[node.id] = labelId;

        node.label = labelId;

        node.flowRate = 0;

        updateExitsTable();

    } else if(type === 'entry') {

        caissonNode = node;

        node.label = 'C';

    }

}

function showExitFlowInput(node) {

    const input = prompt('Débit pour '+node.label+' (m3/h):', node.flowRate || 0);

    if(input !== null) {

        node.flowRate = parseFloat(input) || 0;

        calculateFlowRatesInverse();

    }

}

function updateExitsTable() {

    const exits = nodes.filter(n => n.type === 'exit');

    const container = document.getElementById('exitsTableContainer');

    if(exits.length === 0) {

        container.innerHTML = '<p class="hint">Aucune bouche. Cliquez sur Sortie/Bouche pour en ajouter.</p>';

        return;

    }

    let html = '<table class="exits-table"><thead><tr><th>Bouche</th><th>Débit (m3/h)</th></tr></thead><tbody>';

    exits.forEach(node => {

        html += '<tr><td>'+node.label+'</td><td><input type="number" data-node-id="'+node.id+'" value="'+(node.flowRate||0)+'" min="0" onchange="updateExitFlow(\''+node.id+'\',this.value)"></td></tr>';

    });

    html += '</tbody></table>';

    container.innerHTML = html;

    document.getElementById('exitsPanel').style.display = 'block';

    calculateFlowRatesInverse();

}

function updateExitFlow(nodeId, value) {

    const node = nodes.find(n => n.id === nodeId);

    if(node) {

        node.flowRate = parseFloat(value) || 0;

        calculateFlowRatesInverse();

    }

}

function selectSegment(seg) {

    if(selectedSegment) {

        selectedSegment.path.classList.remove('selected');

    }

    selectedSegment = seg;

    seg.path.classList.add('selected');

    showSegmentProperties(seg);

}

function showSegmentProperties(seg) {

    const container = document.getElementById('segmentProps');

    const diameter = seg.diameter || 200;

    const flow = seg.flowRate || 0;

    const length = seg.length || 0;

    const direction = seg.direction || 'Non défini';

    let html = '<div class="property-row"><span class="property-label">Segment:</span><strong>'+seg.name+'</strong></div>';

    html += '<div class="property-row"><span class="property-label">Diametre:</span>';

    html += '<select onchange="updateSegmentDiameter(\''+seg.id+'\',this.value)">';

    diamDispo.forEach(d => {

        html += '<option value="'+d+'"'+(d === diameter ? ' selected' : '')+'>'+d+' mm</option>';

    });

    html += '</select></div>';

    html += '<div class="property-row"><span class="property-label">Longueur:</span><span>'+length.toFixed(2)+' m</span></div>';

    html += '<div class="property-row"><span class="property-label">Debit:</span><span>'+Math.round(flow)+' m3/h</span></div>';

    html += '<div class="property-row"><span class="property-label">Sens:</span><span>'+direction+'</span></div>';

    html += '<button class="tool-btn" onclick="showAccessoriesModal(\''+seg.id+'\')" style="margin-top:10px">Accessoires ('+seg.accessories.length+')</button>';

    container.innerHTML = html;

}

function updateSegmentDiameter(segId, diameter) {

    const seg = segments.find(s => s.id === segId);

    if(seg) {

        seg.diameter = parseFloat(diameter);

        calculateDrawnNetwork();

    }

}

function showAccessoriesModal(segId) {

    const seg = segments.find(s => s.id === segId);

    if(!seg) return;

    const modal = document.getElementById('accessoriesModal');

    const content = document.getElementById('accessoriesContent');

    let html = '<h3>Accessoires pour '+seg.name+'</h3>';

    html += '<button class="btn btn-secondary btn-sm" onclick="addAccessoryToSegment(\''+seg.id+'\')" style="margin-bottom:10px">+ Ajouter</button>';

    html += '<table><thead><tr><th>Type</th><th>Zeta</th><th>Action</th></tr></thead><tbody>';

    seg.accessories.forEach((acc, idx) => {

        html += '<tr><td>'+(acc.name||ZETA_DB[acc.type]?.n||acc.type)+'</td><td>'+(acc.zeta||ZETA_DB[acc.type]?.z||0)+'</td><td><button class="btn btn-danger btn-sm" onclick="removeAccessoryFromSegment(\''+seg.id+'\','+idx+')">X</button></td></tr>';

    });

    html += '</tbody></table>';

    content.innerHTML = html;

    modal.style.display = 'block';

}

function addAccessoryToSegment(segId) {
    const seg = segments.find(s => s.id === segId);
    if (!seg) return;
    const accessoryTypes = Object.keys(ZETA_DB);
    const selectedType = prompt('Type d\'accessoire (' + accessoryTypes.join(', ') + '):');
    if (!selectedType || !accessoryTypes.includes(selectedType)) {
        alert('Type invalide. Types disponibles: ' + accessoryTypes.join(', '));
        return;
    }
    const zetaValue = ZETA_DB[selectedType].z;
    const customZeta = prompt('Valeur Zeta personnalisee (laisser vide pour utiliser ' + zetaValue + '):', zetaValue);
    const finalZeta = customZeta ? parseFloat(customZeta) : zetaValue;
    if (isNaN(finalZeta)) {
        alert('Valeur Zeta invalide');
        return;
    }
    const customName = prompt('Nom personnalise (laisser vide pour utiliser le nom par defaut):', ZETA_DB[selectedType].n);
    seg.accessories.push({
        type: selectedType,
        zeta: finalZeta,
        name: customName || ZETA_DB[selectedType].n
    });
    document.getElementById("accessoriesModal").style.display = "none";
    selectSegment(seg);
    calculateDrawnNetwork();
}

function removeAccessoryFromSegment(segId, idx) {
    const seg = segments.find(s => s.id === segId);
    if (seg && seg.accessories[idx]) {
        seg.accessories.splice(idx, 1);
        document.getElementById("accessoriesModal").style.display = "none";
        selectSegment(seg);
        calculateDrawnNetwork();
    }
}

// Calcule le diamètre optimal pour un débit donné

function calculateOptimalDiameter(flow, maxVelocity) {

    if(flow <= 0) return 200;

    const Q = flow / 3600; // m3/s

    const radius = Math.sqrt(Q / (Math.PI * (maxVelocity || 4)));

    const diameter = radius * 2 * 1000; // mm

    return trouverDiametreCommercial(diameter);

}

// Construit le graphe du réseau et calcule les sens

function buildNetworkGraph() {

    const graph = {nodes: {}, edges: {}};

    

    // Ajouter tous les nœuds

    nodes.forEach(node => {

        graph.nodes[node.id] = {

            id: node.id,

            type: node.type,

            x: node.x,

            y: node.y,

            flowRate: node.flowRate || 0,

            label: node.label

        };

    });

    

    // Ajouter toutes les arêtes (segments)

    segments.forEach(seg => {

        const edgeId = seg.id;

        graph.edges[edgeId] = {

            id: edgeId,

            name: seg.name,

            from: seg.node1.id,

            to: seg.node2.id,

            length: seg.length,

            diameter: seg.diameter,

            flowRate: seg.flowRate,

            accessories: seg.accessories

        };

    });

    

    return graph;

}

// Trouve le chemin depuis le caisson vers une bouche

function findPathFromCaisson(graph, targetNodeId) {

    const visited = new Set();

    const queue = [];

    const parent = {};

    

    // Trouver le caisson

    const caisson = nodes.find(n => n.type === 'entry');

    if(!caisson) return [];

    

    queue.push(caisson.id);

    visited.add(caisson.id);

    parent[caisson.id] = null;

    

    while(queue.length > 0) {

        const currentId = queue.shift();

        

        if(currentId === targetNodeId) {

            // Reconstruire le chemin

            const path = [];

            let nodeId = targetNodeId;

            while(nodeId !== null) {

                path.unshift(nodeId);

                nodeId = parent[nodeId];

            }

            return path;

        }

        

        // Trouver tous les segments connectés à ce nœud

        const connectedEdges = Object.values(graph.edges).filter(edge => 

            edge.from === currentId || edge.to === currentId

        );

        

        for(const edge of connectedEdges) {

            const nextNodeId = edge.from === currentId ? edge.to : edge.from;

            if(!visited.has(nextNodeId)) {

                visited.add(nextNodeId);

                parent[nextNodeId] = currentId;

                queue.push(nextNodeId);

            }

        }

    }

    

    return [];

}

// Helper function to check if a segment is passing through a node (not just an endpoint)
function isSegmentPassingThrough(seg, node) {
    if(!seg || !seg.path || !node) return false;
    const path = seg.path.getAttribute('d');
    if(!path) return false;
    const match = path.match(/M[\s]*([\d.]+)[\s]*([\d.]+)[\s]*L[\s]*([\d.]+)[\s]*([\d.]+)/);
    if(!match) return false;
    const x1 = parseFloat(match[1]), y1 = parseFloat(match[2]);
    const x2 = parseFloat(match[3]), y2 = parseFloat(match[4]);
    if((Math.abs(x1 - node.x) < 2 && Math.abs(y1 - node.y) < 2) ||
       (Math.abs(x2 - node.x) < 2 && Math.abs(y2 - node.y) < 2)) {
        return false;
    }
    if(Math.abs(y2 - y1) < 2) {
        return Math.abs(y1 - node.y) < 2 && node.x >= Math.min(x1, x2) - 2 && node.x <= Math.max(x1, x2) + 2;
    }
    if(Math.abs(x2 - x1) < 2) {
        return Math.abs(x1 - node.x) < 2 && node.y >= Math.min(y1, y2) - 2 && node.y <= Math.max(y1, y2) + 2;
    }
    return false;
}

// Détecte les intersections entre segments et ajoute des Tés automatiquement
function detectIntersections() {
    const newSegments = [];
    const processedSegments = new Set();
    const TOLERANCE = 2;
    
    if(segments.length < 2) return;
    
    for(let i = 0; i < segments.length; i++) {
        if(processedSegments.has(i)) continue;
        const seg1 = segments[i];
        if(!seg1 || !seg1.path || !seg1.node1 || !seg1.node2) continue;
        const path1 = seg1.path.getAttribute('d');
        if(!path1) continue;
        const m1 = path1.match(/M[\s]*([\d.]+)[\s]*([\d.]+)[\s]*L[\s]*([\d.]+)[\s]*([\d.]+)/);
        if(!m1) continue;
        const x1 = parseFloat(m1[1]), y1 = parseFloat(m1[2]);
        const x2 = parseFloat(m1[3]), y2 = parseFloat(m1[4]);
        if(Math.abs(x2 - x1) < TOLERANCE && Math.abs(y2 - y1) < TOLERANCE) continue;
        const seg1IsHorizontal = Math.abs(y2 - y1) <= TOLERANCE;
        const seg1IsVertical = Math.abs(x2 - x1) <= TOLERANCE;
        if(!seg1IsHorizontal && !seg1IsVertical) continue;
        
        for(let j = i + 1; j < segments.length; j++) {
            if(processedSegments.has(j)) continue;
            const seg2 = segments[j];
            if(!seg2 || !seg2.path || !seg2.node1 || !seg2.node2) continue;
            if(seg1.node1 === seg2.node1 || seg1.node1 === seg2.node2 || 
               seg1.node2 === seg2.node1 || seg1.node2 === seg2.node2) {
                continue;
            }
            const path2 = seg2.path.getAttribute('d');
            if(!path2) continue;
            const m2 = path2.match(/M[\s]*([\d.]+)[\s]*([\d.]+)[\s]*L[\s]*([\d.]+)[\s]*([\d.]+)/);
            if(!m2) continue;
            const x3 = parseFloat(m2[1]), y3 = parseFloat(m2[2]);
            const x4 = parseFloat(m2[3]), y4 = parseFloat(m2[4]);
            if(Math.abs(x4 - x3) < TOLERANCE && Math.abs(y4 - y3) < TOLERANCE) continue;
            const seg2IsHorizontal = Math.abs(y4 - y3) <= TOLERANCE;
            const seg2IsVertical = Math.abs(x4 - x3) <= TOLERANCE;
            if(!seg2IsHorizontal && !seg2IsVertical) continue;
            if((seg1IsHorizontal && seg2IsHorizontal) || (seg1IsVertical && seg2IsVertical)) continue;
            
            let hx1, hx2, hy, vx, vy1, vy2;
            if(seg1IsHorizontal) {
                hx1 = x1; hx2 = x2; hy = y1;
                vx = x3; vy1 = y3; vy2 = y4;
            } else {
                hx1 = x3; hx2 = x4; hy = y3;
                vx = x1; vy1 = y1; vy2 = y2;
            }
            const hxMin = Math.min(hx1, hx2);
            const hxMax = Math.max(hx1, hx2);
            const vyMin = Math.min(vy1, vy2);
            const vyMax = Math.max(vy1, vy2);
            if(!(vx >= hxMin - TOLERANCE && vx <= hxMax + TOLERANCE &&
                  hy >= vyMin - TOLERANCE && hy <= vyMax + TOLERANCE)) continue;
            
            const ix = Math.round(vx);
            const iy = Math.round(hy);
            
            const existingNode = nodes.find(n => Math.abs(n.x - ix) <= TOLERANCE && Math.abs(n.y - iy) <= TOLERANCE);
            if(existingNode) {
                if(existingNode.type === 'junction') {
                    if(!seg1.accessories.some(a => a.type === 'te_branche' || a.type === 'te_droit')) {
                        seg1.accessories.push({type: 'te_branche', zeta: 0.5, name: 'Té'});
                    }
                    if(!seg2.accessories.some(a => a.type === 'te_branche' || a.type === 'te_droit')) {
                        seg2.accessories.push({type: 'te_branche', zeta: 0.5, name: 'Té'});
                    }
                }
                continue;
            }
            
            const junctionNode = {id: 'node_'+Date.now(), x: ix, y: iy, type: 'junction', element: null};
            nodes.push(junctionNode);
            
            const seg1IsHoriz = seg1IsHorizontal;
            const seg2IsHoriz = seg2IsHorizontal;
            
            const seg1P1_x1 = seg1IsHoriz ? (x1 < x2 ? x1 : x2) : x1;
            const seg1P1_y1 = seg1IsHoriz ? y1 : (y1 < y2 ? y1 : y2);
            const seg1P1_x2 = ix;
            const seg1P1_y2 = iy;
            
            const seg1Part1 = {
                id: 'S' + (++segmentCounter),
                name: 'S' + segmentCounter,
                path: createPathElement(seg1P1_x1, seg1P1_y1, seg1P1_x2, seg1P1_y2),
                node1: seg1IsHoriz ? (x1 < x2 ? seg1.node1 : seg1.node2) : (y1 < y2 ? seg1.node1 : seg1.node2),
                node2: junctionNode,
                length: Math.sqrt(Math.pow(seg1P1_x2 - seg1P1_x1, 2) + Math.pow(seg1P1_y2 - seg1P1_y1, 2)) / SCALE,
                accessories: [...seg1.accessories],
                diameter: seg1.diameter,
                flowRate: seg1.flowRate,
                direction: null
            };
            
            const seg1P2_x1 = ix;
            const seg1P2_y1 = iy;
            const seg1P2_x2 = seg1IsHoriz ? (x1 > x2 ? x1 : x2) : x2;
            const seg1P2_y2 = seg1IsHoriz ? y2 : (y1 > y2 ? y1 : y2);
            
            const seg1Part2 = {
                id: 'S' + (++segmentCounter),
                name: 'S' + segmentCounter,
                path: createPathElement(seg1P2_x1, seg1P2_y1, seg1P2_x2, seg1P2_y2),
                node1: junctionNode,
                node2: seg1IsHoriz ? (x1 > x2 ? seg1.node1 : seg1.node2) : (y1 > y2 ? seg1.node1 : seg1.node2),
                length: Math.sqrt(Math.pow(seg1P2_x2 - seg1P2_x1, 2) + Math.pow(seg1P2_y2 - seg1P2_y1, 2)) / SCALE,
                accessories: [],
                diameter: seg1.diameter,
                flowRate: seg1.flowRate,
                direction: null
            };
            
            const seg2P1_x1 = seg2IsHoriz ? (x3 < x4 ? x3 : x4) : x3;
            const seg2P1_y1 = seg2IsHoriz ? y3 : (y3 < y4 ? y3 : y4);
            const seg2P1_x2 = ix;
            const seg2P1_y2 = iy;
            
            const seg2Part1 = {
                id: 'S' + (++segmentCounter),
                name: 'S' + segmentCounter,
                path: createPathElement(seg2P1_x1, seg2P1_y1, seg2P1_x2, seg2P1_y2),
                node1: seg2IsHoriz ? (x3 < x4 ? seg2.node1 : seg2.node2) : (y3 < y4 ? seg2.node1 : seg2.node2),
                node2: junctionNode,
                length: Math.sqrt(Math.pow(seg2P1_x2 - seg2P1_x1, 2) + Math.pow(seg2P1_y2 - seg2P1_y1, 2)) / SCALE,
                accessories: [...seg2.accessories],
                diameter: seg2.diameter,
                flowRate: seg2.flowRate,
                direction: null
            };
            
            const seg2P2_x1 = ix;
            const seg2P2_y1 = iy;
            const seg2P2_x2 = seg2IsHoriz ? (x3 > x4 ? x3 : x4) : x4;
            const seg2P2_y2 = seg2IsHoriz ? y4 : (y3 > y4 ? y3 : y4);
            
            const seg2Part2 = {
                id: 'S' + (++segmentCounter),
                name: 'S' + segmentCounter,
                path: createPathElement(seg2P2_x1, seg2P2_y1, seg2P2_x2, seg2P2_y2),
                node1: junctionNode,
                node2: seg2IsHoriz ? (x3 > x4 ? seg2.node1 : seg2.node2) : (y3 > y4 ? seg2.node1 : seg2.node2),
                length: Math.sqrt(Math.pow(seg2P2_x2 - seg2P2_x1, 2) + Math.pow(seg2P2_y2 - seg2P2_y1, 2)) / SCALE,
                accessories: [],
                diameter: seg2.diameter,
                flowRate: seg2.flowRate,
                direction: null
            };
            
            if(!seg1.accessories.some(a => a.type === 'te_branche' || a.type === 'te_droit')) {
                seg1.accessories.push({type: 'te_branche', zeta: 0.5, name: 'Té'});
            }
            if(!seg2.accessories.some(a => a.type === 'te_branche' || a.type === 'te_droit')) {
                seg2.accessories.push({type: 'te_branche', zeta: 0.5, name: 'Té'});
            }
            
            newSegments.push(seg1Part1, seg1Part2, seg2Part1, seg2Part2);
            processedSegments.add(i);
            processedSegments.add(j);
            
            if(seg1.path && seg1.path.parentNode) seg1.path.parentNode.removeChild(seg1.path);
            if(seg2.path && seg2.path.parentNode) seg2.path.parentNode.removeChild(seg2.path);
            
            canvasElement.appendChild(seg1Part1.path);
            canvasElement.appendChild(seg1Part2.path);
            canvasElement.appendChild(seg2Part1.path);
            canvasElement.appendChild(seg2Part2.path);
            
            [seg1Part1, seg1Part2, seg2Part1, seg2Part2].forEach(s => {
                s.path.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectSegment(s);
                });
            });
        }
    }
    
    segments = segments.filter((_, i) => !processedSegments.has(i)).concat(newSegments);
    drawnPaths = segments.map(s => s.path);
}




// Calcule les débits segment par segment avec propagation correcte depuis les bouches vers le Caisson (réseau arborescent)
function calculateFlowRatesInverse() {
    if(!caissonNode) {
        alert('Veuillez d abord definir un point Caisson (entree)');
        return;
    }
    
    // Réinitialiser tous les débits
    segments.forEach(seg => {
        seg.flowRate = 0;
        seg.direction = null;
    });
    nodes.forEach(node => {
        if(node.type !== 'exit') node.flowRate = 0;
        nodeFlows[node.id] = node.type === 'exit' ? (node.flowRate || 0) : 0;
    });
    
    // Calculer le débit total des bouches
    const exits = nodes.filter(n => n.type === 'exit');
    let totalExitFlow = 0;
    exits.forEach(exit => totalExitFlow += (exit.flowRate || 0));
    
    document.getElementById('totalExitsFlow').textContent = Math.round(totalExitFlow);
    document.getElementById('totalFlowRate').value = Math.round(totalExitFlow);
    
    if(totalExitFlow === 0) {
        displayFlowRatesOnDrawing();
        return;
    }
    
    const graph = buildNetworkGraph();
    const caisson = nodes.find(n => n.type === 'entry');
    if(!caisson) return;
    
    // Pour chaque bouche, ajouter son débit à tous les segments sur son chemin vers le caisson
    exits.forEach(exit => {
        const exitFlow = exit.flowRate || 0;
        if(exitFlow === 0) return;
        
        // Trouver le chemin depuis le caisson vers cette bouche
        const path = findPathFromCaisson(graph, exit.id);
        if(path.length < 2) return;
        
        // Trouver les segments qui connectent ces nœuds
        for(let i = 0; i < path.length - 1; i++) {
            const fromNodeId = path[i];
            const toNodeId = path[i+1];
            
            const seg = segments.find(s => 
                (s.node1.id === fromNodeId && s.node2.id === toNodeId) ||
                (s.node1.id === toNodeId && s.node2.id === fromNodeId)
            );
            
            if(seg) {
                // Ajouter le débit de cette bouche au segment
                seg.flowRate += exitFlow;
                
                // Déterminer la direction (du caisson vers la bouche)
                seg.direction = seg.node1.id === fromNodeId ? 'node1->node2' : 'node2->node1';
                
                // Calculer le diamètre optimal pour ce débit
                const vm = parseFloat(document.getElementById('editorVitesseMax').value) || 4;
                if(seg.flowRate > 0) {
                    seg.diameter = calculateOptimalDiameter(seg.flowRate, vm);
                }
            }
        }
    });
    
    // Appeler mergeColinearSegments pour fusionner les sections continues
    mergeColinearSegments();
    mergeSimpleJunctions();
    
    displayFlowRatesOnDrawing();
}





function getDistanceFromCaisson(graph, caissonId, targetId) {
    if(caissonId === targetId) return 0;
    
    const visited = new Set();
    const queue = [{nodeId: caissonId, distance: 0}];
    visited.add(caissonId);
    
    while(queue.length > 0) {
        const {nodeId, distance} = queue.shift();
        
        const connectedEdges = Object.values(graph.edges).filter(edge =>
            edge.from === nodeId || edge.to === nodeId
        );
        
        for(const edge of connectedEdges) {
            const nextNodeId = edge.from === nodeId ? edge.to : edge.from;
            if(nextNodeId === targetId) {
                return distance + 1;
            }
            if(!visited.has(nextNodeId)) {
                visited.add(nextNodeId);
                queue.push({nodeId: nextNodeId, distance: distance + 1});
            }
        }
    }
    
    return -1;
}


function mergeColinearSegments() {
    // This function merges segments that form a continuous section (connected by elbows)
    // For now, we ensure that connected segments on the same path have consistent flow rates
    // which is already handled by calculateFlowRatesInverse using Math.min(node1Flow, node2Flow)
    
    // Future enhancement: actually merge segments that are colinear or connected by elbows
    // For tree networks, segments on the same path from caisson to an exit should have the same flow
    
    // Ensure all segments on the same path have consistent diameters
    // If two connected segments have the same flow, they should have the same diameter
    segments.forEach(seg => {
        if(seg.flowRate > 0) {
            const vm = parseFloat(document.getElementById('editorVitesseMax').value) || 4;
            const optimalDiameter = calculateOptimalDiameter(seg.flowRate, vm);
            // Only update if significantly different
            if(Math.abs(seg.diameter - optimalDiameter) > 10) {
                seg.diameter = optimalDiameter;
            }
        }
    });
}

function mergeSimpleJunctions() {
    // This function merges simple junctions (2 segments = elbow) and ensures T-junctions (3+ segments) have proper accessories
    
    const junctionNodes = nodes.filter(n => n.type === 'junction');
    const segmentsToRemove = new Set();
    const newSegments = [];
    
    junctionNodes.forEach(junction => {
        // Find all segments connected to this junction
        const connectedSegs = segments.filter(seg => 
            seg.node1.id === junction.id || seg.node2.id === junction.id
        );
        
        if(connectedSegs.length === 2) {
            // This is an elbow (2 segments meeting at a junction)
            // Merge the two segments into one with an elbow accessory
            
            const seg1 = connectedSegs[0];
            const seg2 = connectedSegs[1];
            
            // Determine which nodes are the "outer" nodes (not the junction)
            const outerNode1 = seg1.node1.id === junction.id ? seg1.node2 : seg1.node1;
            const outerNode2 = seg2.node1.id === junction.id ? seg2.node2 : seg2.node1;
            
            // Check if segments are orthogonal (one horizontal, one vertical)
            const path1 = seg1.path.getAttribute('d');
            const path2 = seg2.path.getAttribute('d');
            
            const m1 = path1 && path1.match(/M[\s]*([\d.]+)[\s]*([\d.]+)[\s]*L[\s]*([\d.]+)[\s]*([\d.]+)/);
            const m2 = path2 && path2.match(/M[\s]*([\d.]+)[\s]*([\d.]+)[\s]*L[\s]*([\d.]+)[\s]*([\d.]+)/);
            
            if(m1 && m2) {
                const x1 = parseFloat(m1[1]), y1 = parseFloat(m1[2]);
                const x2 = parseFloat(m1[3]), y2 = parseFloat(m1[4]);
                const x3 = parseFloat(m2[1]), y3 = parseFloat(m2[2]);
                const x4 = parseFloat(m2[3]), y4 = parseFloat(m2[4]);
                
                const seg1IsHorizontal = Math.abs(y2 - y1) < 2;
                const seg1IsVertical = Math.abs(x2 - x1) < 2;
                const seg2IsHorizontal = Math.abs(y4 - y3) < 2;
                const seg2IsVertical = Math.abs(x4 - x3) < 2;
                
                // Only merge if segments are orthogonal (elbow)
                if((seg1IsHorizontal && seg2IsVertical) || (seg1IsVertical && seg2IsHorizontal)) {
                    // Find the outer nodes
                    const nodeA = nodes.find(n => n.id === outerNode1.id);
                    const nodeB = nodes.find(n => n.id === outerNode2.id);
                    
                    if(nodeA && nodeB) {
                        // Create merged segment
                        const mergedSeg = {
                            id: 'S' + (++segmentCounter),
                            name: 'S' + segmentCounter,
                            path: createPathElement(nodeA.x, nodeA.y, nodeB.x, nodeB.y),
                            node1: nodeA,
                            node2: nodeB,
                            length: seg1.length + seg2.length,
                            accessories: [
                                ...seg1.accessories,
                                ...seg2.accessories,
                                {type: 'coude_90', zeta: 0.25, name: 'Coude 90°'}
                            ],
                            diameter: Math.max(seg1.diameter || 200, seg2.diameter || 200),
                            flowRate: Math.max(seg1.flowRate || 0, seg2.flowRate || 0),
                            direction: null
                        };
                        
                        // Add event listener
                        mergedSeg.path.addEventListener('click', (e) => {
                            e.stopPropagation();
                            selectSegment(mergedSeg);
                        });
                        
                        // Add to canvas
                        canvasElement.appendChild(mergedSeg.path);
                        
                        newSegments.push(mergedSeg);
                        segmentsToRemove.add(seg1);
                        segmentsToRemove.add(seg2);
                        
                        // Remove junction node
                        const junctionIndex = nodes.indexOf(junction);
                        if(junctionIndex > -1) {
                            nodes.splice(junctionIndex, 1);
                        }
                        if(junction.element && junction.element.parentNode) {
                            junction.element.parentNode.removeChild(junction.element);
                        }
                    }
                }
            }
        } else if(connectedSegs.length >= 3) {
            // This is a T-junction (3+ segments)
            // Ensure all segments have T accessories
            connectedSegs.forEach(seg => {
                // Check if this segment is the "main" path (passing through) or a "branch"
                const isMainPath = isSegmentPassingThrough(seg, junction);
                
                // Remove any existing T accessories to avoid duplicates
                seg.accessories = seg.accessories.filter(a => 
                    a.type !== 'te_droit' && a.type !== 'te_branche'
                );
                
                // Add appropriate T accessory
                if(isMainPath) {
                    seg.accessories.push({type: 'te_droit', zeta: 0.1, name: 'Té passage direct'});
                } else {
                    seg.accessories.push({type: 'te_branche', zeta: 0.5, name: 'Té sortie branche'});
                }
            });
        }
    });
    
    // Remove merged segments
    segments = segments.filter(seg => !segmentsToRemove.has(seg));
    segments.push(...newSegments);
    drawnPaths = segments.map(s => s.path);
}

function calculateDrawnNetwork() {

    const vm = parseFloat(document.getElementById('editorVitesseMax').value) || 4;

    const cf = parseFloat(document.getElementById('editorCoeffFrottement').value) || 0.02;

    const rho = parseFloat(document.getElementById('editorDensite').value) || 1.225;

    const results = [];

    segments.forEach((seg, idx) => {

        const Q = seg.flowRate || 0;

        if(Q === 0) return;

        const diameter = seg.diameter || 200;

        const length = seg.length || 0;

        const Qm3s = Q / 3600;

        const radius = diameter / 2000;

        const section = Math.PI * Math.pow(radius, 2);

        const velocity = Qm3s / section;

        const linearLoss = calculerPertesCharge(velocity, diameter, length, cf, rho);

        const singularLoss = calculerPertesSingulieres(seg, velocity, rho);

        results.push({

            segment: seg.name,

            diameter: diameter, 

            flow: Q,

            velocity: velocity, 

            length: length,

            linearLoss: linearLoss, 

            singularLoss: singularLoss,

            totalLoss: linearLoss + singularLoss,

            statut: getStatutBadge(velocity, vm),

            direction: seg.direction || 'Non défini'

        });

    });

    displayEditorResults(results);

}

function displayEditorResults(results) {

    const container = document.getElementById('editorResultsContainer');

    if(results.length === 0) {

        container.innerHTML = '<p class="center-text">Aucun resultat. Dessinez un reseau.</p>';

        return;

    }

    let html = '<table><thead><tr><th>Segment</th><th>Diametre</th><th>Debit</th><th>Vitesse</th><th>Longueur</th><th>P. Lineaires</th><th>P. Singulieres</th><th>Total</th><th>Sens</th><th>Statut</th></tr></thead><tbody>';

    results.forEach(r => {

        html += '<tr>';

        html += '<td>'+r.segment+'</td>';

        html += '<td>'+r.diameter+'</td>';

        html += '<td>'+Math.round(r.flow)+'</td>';

        html += '<td>'+r.velocity.toFixed(2)+'</td>';

        html += '<td>'+r.length.toFixed(2)+'</td>';

        html += '<td>'+r.linearLoss.toFixed(1)+'</td>';

        html += '<td>'+r.singularLoss.toFixed(1)+'</td>';

        html += '<td>'+r.totalLoss.toFixed(1)+'</td>';

        html += '<td>'+(r.direction || 'Non défini')+'</td>';

        html += '<td>'+r.statut+'</td>';

        html += '</tr>';

    });

    html += '</tbody></table>';

    container.innerHTML = html;

    document.getElementById('editorResults').style.display = 'block';

}

function displayFlowRatesOnDrawing() {

    document.querySelectorAll('.flow-label').forEach(el => el.remove());

    document.querySelectorAll('.segment-label').forEach(el => el.remove());

    const svg = canvasElement;

    if(!svg) return;

    segments.forEach(seg => {

        if(!seg.path) return;

        const d = seg.path.getAttribute('d');

        const match = d.match(/M[\s]*([\d.]+)[\s]*([\d.]+)[\s]*L[\s]*([\d.]+)[\s]*([\d.]+)/);

        if(!match) return;

        const x1 = parseFloat(match[1]), y1 = parseFloat(match[2]);

        const x2 = parseFloat(match[3]), y2 = parseFloat(match[4]);

        const midX = (x1 + x2) / 2, midY = (y1 + y2) / 2;

        

        // Afficher le nom du segment

        const nameText = document.createElementNS(svgNS, 'text');

        nameText.setAttribute('x', midX);

        nameText.setAttribute('y', midY - 20);

        nameText.setAttribute('class', 'segment-label');

        nameText.setAttribute('fill', '#2563eb');

        nameText.setAttribute('font-weight', 'bold');

        nameText.setAttribute('font-size', '14');

        nameText.textContent = seg.name;

        svg.appendChild(nameText);

        

        // Afficher le débit

        const flowText = document.createElementNS(svgNS, 'text');

        flowText.setAttribute('x', midX);

        flowText.setAttribute('y', midY - 5);

        flowText.setAttribute('class', 'flow-label');

        flowText.textContent = Math.round(seg.flowRate || 0) + ' m3/h';

        svg.appendChild(flowText);

    });

}

function switchMode(mode) {

    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));

    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));

    document.getElementById(mode + 'Tab').classList.add('active');

    const modeBtns = document.querySelectorAll('.mode-btn');

    if(modeBtns[0]) modeBtns[0].classList.toggle('active', mode === 'calculateur');

    if(modeBtns[1]) modeBtns[1].classList.toggle('active', mode === 'editeur');

    if(mode === 'editeur' && (!canvasElement || canvasElement.innerHTML === '')) {

        initEditor();

    }

}

function setEditorTool(tool) {

    editorTool = tool;

    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {

        btn.classList.toggle('active', btn.getAttribute('data-tool') === tool);

    });

}

function clearDrawing() {

    drawnPaths.forEach(p => {

        if(p && p.parentNode) p.parentNode.removeChild(p);

    });

    nodes.forEach(n => {

        if(n.element && n.element.parentNode) n.element.parentNode.removeChild(n.element);

    });

    document.querySelectorAll('.flow-label').forEach(el => {

        if(el.parentNode) el.parentNode.removeChild(el);

    });

    document.querySelectorAll('.segment-label').forEach(el => {

        if(el.parentNode) el.parentNode.removeChild(el);

    });

    drawnPaths = [];

    nodes = [];

    segments = [];

    selectedSegment = null;

    exitCounter = 0;

    exitLabels = {};

    caissonNode = null;

    segmentCounter = 0;

    if(canvasElement) {

        canvasElement.innerHTML = '';

        drawGrid(canvasElement);

    }

    document.getElementById('exitsPanel').style.display = 'none';

    document.getElementById('editorResults').style.display = 'none';

    document.getElementById('totalExitsFlow').textContent = '0';

    document.getElementById('totalFlowRate').value = '0';

    document.getElementById('segmentProps').innerHTML = '<p class="hint" style="font-size:0.85rem">Selectionnez un segment</p>';

}

function addStraightSegment() { setEditorTool('draw'); }

function addElbow() {
    setEditorTool('draw');
    alert('Utilisez l\'outil de dessin pour créer des segments, puis ajoutez des accessoires via le menu des propriétés du segment.');
}

function addTee() {
    setEditorTool('draw');
    alert('Utilisez l\'outil de dessin pour créer des segments. Les Tés sont ajoutés automatiquement lors de la détection des intersections.');
}

function addReducer() {
    setEditorTool('draw');
    alert('Les réducteurs peuvent être gérés via les accessoires des segments. Sélectionnez un segment et ajoutez un accessoire de type "Reduction".');
}

function updateScale() {

    SCALE = parseInt(document.getElementById('scaleInput').value) || 20;

    GRID_SIZE = SCALE;

    if(canvasElement) {

        canvasElement.innerHTML = '';

        drawGrid(canvasElement);

        segments.forEach(seg => {

            if(seg.path && seg.path.parentNode !== canvasElement) {

                canvasElement.appendChild(seg.path);

            }

        });

        nodes.forEach(n => {

            if(n.element && n.element.parentNode !== canvasElement) {

                canvasElement.appendChild(n.element);

            }

        });

        displayFlowRatesOnDrawing();

    }

}

function updateTotalFlow() {
    const exits = nodes.filter(n => n.type === 'exit');
    const total = exits.reduce((sum, exit) => sum + (exit.flowRate || 0), 0);
    document.getElementById('totalExitsFlow').textContent = Math.round(total);
    document.getElementById('totalFlowRate').value = Math.round(total);

    // Le débit total est calculé automatiquement depuis les bouches

}

function exportToPDF() {

    if (!window.jspdf || !window.html2canvas) {

        alert('Les bibliothèques PDF se chargent. Attendez quelques secondes et réessayez.');

        if (typeof loadPDFLibraries === 'function') {

            loadPDFLibraries(() => exportToPDF());

        }

        return;

    }

    const { jsPDF } = window.jspdf;

    const doc = new jsPDF('landscape', 'mm', 'a4');

    const drawingArea = document.querySelector('.drawing-area');

    if(!drawingArea) {

        alert('Zone de dessin introuvable');

        return;

    }

    html2canvas(drawingArea, {

        scale: 2, logging: false, useCORS: true, allowTaint: true

    }).then(canvas => {

        const imgData = canvas.toDataURL('image/png');

        const pdfWidth = doc.internal.pageSize.getWidth();

        const pdfHeight = doc.internal.pageSize.getHeight();

        const ratio = canvas.width / canvas.height;

        const imgWidth = pdfWidth * 0.85;

        const imgHeight = imgWidth / ratio;

        doc.addImage(imgData, 'PNG', 15, 20, imgWidth, imgHeight);

        

        // Ajouter les infos des segments

        doc.setFontSize(16);

        doc.text('Schema Reseau Ventilation', pdfWidth / 2, 15, {align: 'center'});

        doc.setFontSize(12);

        doc.text('Debit total: ' + (document.getElementById('totalExitsFlow').textContent || '0') + ' m3/h', pdfWidth / 2, pdfHeight - 20, {align: 'center'});

        

        let yPos = pdfHeight - 30;

        doc.setFontSize(10);

        segments.forEach((seg, idx) => {

            if(seg.flowRate > 0) {

                const info = seg.name + ': O' + seg.diameter + 'mm, ' + seg.length.toFixed(2) + 'm, ' + Math.round(seg.flowRate) + ' m3/h';

                doc.text(info, 15, yPos);

                yPos -= 7;

                if(yPos < 30) { doc.addPage(); yPos = pdfHeight - 30; }

            }

        });

        doc.save('reseau_ventilation_' + new Date().toLocaleDateString() + '.pdf');

    }).catch(err => {

        console.error('Error exporting to PDF:', err);

        alert('Erreur PDF: ' + err.message);

    });

}

