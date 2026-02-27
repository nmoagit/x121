import json
import sys
from pathlib import Path

def convert_ui_to_api(ui_path, api_path):
    with open(ui_path, 'r', encoding='utf-8') as f:
        ui_data = json.load(f)
    
    nodes = ui_data.get('nodes', [])
    links = ui_data.get('links', [])
    
    # link_id -> [from_node, from_slot]
    link_map = {l[0]: [str(l[1]), l[2]] for l in links}
    
    api_data = {}
    
    for node in nodes:
        node_id = str(node['id'])
        class_type = node.get('type')
        
        # Skip notes or group nodes
        if not class_type or class_type == "Note":
            continue
            
        inputs = {}
        
        # 1. Handle actual input links (wires)
        node_inputs = node.get('inputs', [])
        for inp in node_inputs:
            link_id = inp.get('link')
            if link_id in link_map:
                inputs[inp['name']] = link_map[link_id]
        
        # 2. Handle widgets (values inside the node)
        # Without the node definitions, we dont know the names.
        # We will use "widget_X" as a placeholder, or try to guess.
        widgets = node.get('widgets_values', [])
        for i, val in enumerate(widgets):
            # Try to guess common names based on value type or index
            # This is a bit of a hack but better than nothing
            key = f"widget_{i}"
            inputs[key] = val
            
        api_data[node_id] = {
            "inputs": inputs,
            "class_type": class_type
        }
        
    with open(api_path, 'w', encoding='utf-8') as f:
        json.dump(api_data, f, indent=2)
    
    print(f"Successfully converted structural graph to {api_path}")
    print("WARNING: Widget names (seed, steps, etc) are generic placeholders.")
    print("You may need to manually rename 'widget_0', 'widget_1' etc to the correct names.")

if __name__ == "__main__":
    src = "/mnt/d/Projects/trulience/runpod/bottom.json"
    dst = "/mnt/d/Projects/trulience/runpod/bottom_api.json"
    convert_ui_to_api(src, dst)
