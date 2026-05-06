// Détecte les intersections entre segments et ajoute des Tés automatiquement
function detectIntersections() {
    const newSegments = [];
    const processedSegments = new Set();
    
    for(let i = 0; i < segments.length; i++) {
        if(processedSegments.has(i)) continue;
        const seg1 = segments[i];
        
        for(let j = i + 1; j < segments.length; j++) {
            if(processedSegments.has(j)) continue;
            const seg2 = segments[j];
            
            // Ignorer si les segments partagent déjà un nœud
            if(seg1.node1 === seg2.node1 || seg1.node1 === seg2.node2 || 
               seg1.node2 === seg2.node1 || seg1.node2 === seg2.node2) {
                continue;
            }
            
            const path1 = seg1.path.getAttribute('d');
            const path2 = seg2.path.getAttribute('d');
            
            const m1 = path1.match(/M[\s]*([\d.]+)[\s]*([\d.]+)[\s]*L[\s]*([\d.]+)[\s]*([\d.]+)/);
            const m2 = path2.match(/M[\s]*([\d.]+)[\s]*([\d.]+)[\s]*L[\s]*([\d.]+)[\s]*([\d.]+)/);
            
            if(!m1 || !m2) continue;
            
            const x1 = parseFloat(m1[1]), y1 = parseFloat(m1[2]);
            const x2 = parseFloat(m1[3]), y2 = parseFloat(m1[4]);
            const x3 = parseFloat(m2[1]), y3 = parseFloat(m2[2]);
            const x4 = parseFloat(m2[3]), y4 = parseFloat(m2[4]);
            
            const seg1Horizontal = (y1 === y2);
            const seg2Horizontal = (y3 === y4);
            
            if(seg1Horizontal === seg2Horizontal) continue;
            
            // Un segment est horizontal, l'autre vertical
            let hx1, hx2, hy, vx, vy1, vy2;
            
            if(seg1Horizontal) {
                hx1 = Math.min(x1, x2); hx2 = Math.max(x1, x2); hy = y1;
                vx = x3; vy1 = Math.min(y3, y4); vy2 = Math.max(y3, y4);
            } else {
                hx1 = Math.min(x3, x4); hx2 = Math.max(x3, x4); hy = y3;
                vx = x1; vy1 = Math.min(y1, y2); vy2 = Math.max(y1, y2);
            }
            
            // Vérifier si les segments se croisent
            if(vx >= hx1 && vx <= hx2 && hy >= vy1 && hy <= vy2) {
                const ix = vx;
                const iy = hy;
                
                // Vérifier si un nœud existe déjà à cette position
                const existingNode = nodes.find(n => n.x === ix && n.y === iy);
                if(existingNode) {
                    continue;
                }
                
                // Créer un nouveau nœud de jonction
                const junctionNode = {id: 'node_'+Date.now(), x: ix, y: iy, type: 'junction', element: null, label: 'J' + (nodes.filter(n => n.type === 'junction').length + 1)};
                nodes.push(junctionNode);
                
                // Diviser seg1 en deux parties
                const seg1MinX = seg1Horizontal ? Math.min(x1, x2) : x1;
                const seg1MaxX = seg1Horizontal ? Math.max(x1, x2) : x1;
                const seg1MinY = seg1Horizontal ? y1 : Math.min(y1, y2);
                const seg1MaxY = seg1Horizontal ? y1 : Math.max(y1, y2);
                
                // Seg1 partie 1 : de node1 à junction
                const seg1Part1 = {
                    id: 'S' + (++segmentCounter),
                    name: 'S' + segmentCounter,
                    path: createPathElement(
                        seg1Horizontal ? (x1 === seg1MinX ? x1 : x2) : ix,
                        seg1Horizontal ? hy : (y1 === seg1MinY ? y1 : y2),
                        ix, iy
                    ),
                    node1: seg1.node1,
                    node2: junctionNode,
                    length: (seg1Horizontal ? Math.abs(ix - (x1 === seg1MinX ? x1 : x2)) : Math.abs(iy - (y1 === seg1MinY ? y1 : y2))) / SCALE,
                    accessories: [...seg1.accessories],
                    diameter: seg1.diameter,
                    flowRate: 0,
                    direction: null
                };
                
                // Seg1 partie 2 : de junction à node2
                const seg1Part2 = {
                    id: 'S' + (++segmentCounter),
                    name: 'S' + segmentCounter,
                    path: createPathElement(ix, iy,
                        seg1Horizontal ? (x1 === seg1MaxX ? x1 : x2) : ix,
                        seg1Horizontal ? hy : (y1 === seg1MaxY ? y1 : y2)),
                    node1: junctionNode,
                    node2: seg1.node2,
                    length: (seg1Horizontal ? Math.abs((x1 === seg1MaxX ? x1 : x2) - ix) : Math.abs((y1 === seg1MaxY ? y1 : y2) - iy)) / SCALE,
                    accessories: [],
                    diameter: seg1.diameter,
                    flowRate: 0,
                    direction: null
                };
                
                // Diviser seg2 en deux parties
                const seg2MinX = seg2Horizontal ? Math.min(x3, x4) : x3;
                const seg2MaxX = seg2Horizontal ? Math.max(x3, x4) : x3;
                const seg2MinY = seg2Horizontal ? y3 : Math.min(y3, y4);
                const seg2MaxY = seg2Horizontal ? y3 : Math.max(y3, y4);
                
                // Seg2 partie 1 : de node1 à junction
                const seg2Part1 = {
                    id: 'S' + (++segmentCounter),
                    name: 'S' + segmentCounter,
                    path: createPathElement(
                        seg2Horizontal ? (x3 === seg2MinX ? x3 : x4) : ix,
                        seg2Horizontal ? hy : (y3 === seg2MinY ? y3 : y4),
                        ix, iy
                    ),
                    node1: seg2.node1,
                    node2: junctionNode,
                    length: (seg2Horizontal ? Math.abs(ix - (x3 === seg2MinX ? x3 : x4)) : Math.abs(iy - (y3 === seg2MinY ? y3 : y4))) / SCALE,
                    accessories: [...seg2.accessories],
                    diameter: seg2.diameter,
                    flowRate: 0,
                    direction: null
                };
                
                // Seg2 partie 2 : de junction à node2
                const seg2Part2 = {
                    id: 'S' + (++segmentCounter),
                    name: 'S' + segmentCounter,
                    path: createPathElement(ix, iy,
                        seg2Horizontal ? (x3 === seg2MaxX ? x3 : x4) : ix,
                        seg2Horizontal ? hy : (y3 === seg2MaxY ? y3 : y4)),
                    node1: junctionNode,
                    node2: seg2.node2,
                    length: (seg2Horizontal ? Math.abs((x3 === seg2MaxX ? x3 : x4) - ix) : Math.abs((y3 === seg2MaxY ? y3 : y4) - iy)) / SCALE,
                    accessories: [],
                    diameter: seg2.diameter,
                    flowRate: 0,
                    direction: null
                };
                
                // Remplacer les anciens segments par les nouveaux
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
                
                newSegments.push(seg1Part1, seg1Part2, seg2Part1, seg2Part2);
                processedSegments.add(i);
                processedSegments.add(j);
            }
        }
    }
    
    segments = segments.filter((_, i) => !processedSegments.has(i)).concat(newSegments);
    drawnPaths = segments.map(s => s.path);
}
