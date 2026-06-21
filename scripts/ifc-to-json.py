import ifcopenshell
import ifcopenshell.geom as geom
import sys
import json

ifc_file = sys.argv[1]
out_file = sys.argv[2] if len(sys.argv) > 2 else ifc_file.replace('.ifc', '.json')

settings = geom.settings()
settings.set(settings.USE_WORLD_COORDS, True)
settings.set(settings.WELD_VERTICES, True)

f = ifcopenshell.open(ifc_file)
print(f"IFC: {ifc_file}", flush=True)
print(f"Schema: {f.schema}", flush=True)
print(f"Total elements: {len(list(f))}", flush=True)

# Get all building elements
element_types = ["IfcBeam", "IfcColumn", "IfcSlab", "IfcWall", "IfcRoof", 
                 "IfcPlate", "IfcMember", "IfcStair", "IfcRamp", "IfcCovering",
                 "IfcDoor", "IfcWindow", "IfcBuildingElement", "IfcFooting",
                 "IfcPile", "IfcOpeningElement", "IfcFurnishingElement",
                 "IfcFlowTerminal", "IfcFlowSegment", "IfcFlowFitting"]

all_products = []
for et in element_types:
    try:
        all_products.extend(f.by_type(et))
    except:
        pass

# Remove duplicates
seen = set()
unique_products = []
for p in all_products:
    if p.id() not in seen:
        seen.add(p.id())
        unique_products.append(p)

print(f"Products with geometry to extract: {len(unique_products)}", flush=True)

iterator = geom.iterator(settings, f, include=[t for t in element_types])
iterator.initialize()

valid_products = 0
total_vertices = 0
total_faces = 0
output = []

while True:
    try:
        has_more = iterator.next()
    except:
        break
    if not has_more:
        break
    
    product = iterator.get()
    element = f.by_id(product.id)
    mesh = product.geometry
    
    verts = mesh.verts
    faces = mesh.faces
    
    if len(verts) == 0 or len(faces) == 0:
        continue
    
    # Faces is a flat list of vertex indices (every 3 = one triangle)
    triangles = list(faces)  # already in the right format
    
    if len(triangles) == 0:
        continue
    
    # Vertices as flat array (for Three.js BufferGeometry)
    v = []
    for vi in range(0, len(verts), 3):
        v.append(round(verts[vi], 6))
        v.append(round(verts[vi+1], 6))
        v.append(round(verts[vi+2], 6))
    
    # Indices: faces is already a flat list of vertex indices
    idx = list(faces)
    
    # Get color from material
    color = [0.7, 0.7, 0.7]  # default gray
    try:
        rep = getattr(element, 'Representation', None)
        if rep:
            reps = rep.Representations or []
            for r in reps:
                items = r.Items or []
                for item in items:
                    styles = getattr(item, 'Styles', None) or []
                    for sref in styles:
                        style = getattr(sref, 'Styles', None) or []
                        for ss in style:
                            sc = getattr(ss, 'SurfaceColour', None)
                            if sc:
                                color = [round(sc.Red, 4), round(sc.Green, 4), round(sc.Blue, 4)]
                                break
    except:
        pass
    
    product_data = {
        "expressID": element.id(),
        "type": element.is_a(),
        "name": str(getattr(element, 'Name', '')),
        "vertices": v,
        "indices": idx,
        "color": color,
    }
    output.append(product_data)
    valid_products += 1
    total_vertices += len(v) // 3
    total_faces += len(idx) // 3

xs = [v for p in output for v in p['vertices'][::3]]
ys = [v for p in output for v in p['vertices'][1::3]]
zs = [v for p in output for v in p['vertices'][2::3]]

result = {
    "schema": f.schema,
    "source": ifc_file,
    "products": output,
    "stats": {
        "products": valid_products,
        "vertices": total_vertices,
        "triangles": total_faces,
    },
    "bounds": {
        "min": [round(min(xs), 3), round(min(ys), 3), round(min(zs), 3)],
        "max": [round(max(xs), 3), round(max(ys), 3), round(max(zs), 3)],
    }
}

with open(out_file, 'w') as f_out:
    json.dump(result, f_out)

print(f"Saved: {out_file}", flush=True)
print(f"Products: {valid_products}, Vertices: {total_vertices}, Triangles: {total_faces}", flush=True)
bounds = result['bounds']
print(f"Bounds: [{bounds['min'][0]},{bounds['min'][1]},{bounds['min'][2]}] → [{bounds['max'][0]},{bounds['max'][1]},{bounds['max'][2]}]", flush=True)