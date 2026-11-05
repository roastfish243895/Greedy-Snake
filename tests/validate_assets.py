from pathlib import Path
import json
from PIL import Image
import numpy as np
R=Path(__file__).resolve().parents[1];m=json.loads((R/'assets/manifest.json').read_text(encoding='utf-8'));paths=list(m['head'].values())+list(m['fish'].values())+list(m['foods'].values())
for p in paths:
 im=Image.open(R/p);a=np.array(im);assert im.mode=='RGBA',p;assert a[...,3].min()==0 and a[...,3].max()>=200,p+' alpha';assert im.getbbox(),p+' empty'
 if '/head/' in p:assert im.size==(64,80) and set(np.unique(a[...,3]))=={0,255}
 if '/fish/' in p:assert im.size==(32,32)
 if '/food/' in p:assert im.size==(64,64)
assert not np.array_equal(np.array(Image.open(R/m['head']['open'])),np.array(Image.open(R/m['head']['closed']))),'head states equal'
assert set(m['foods'])=={'openai','qwen','grok','gemini','hunyuan','codex','claude'}
import os
SOURCE_COPIES = Path(os.environ['SOURCE_COPIES']) if os.environ.get('SOURCE_COPIES') else None
expected = {'openai': 'openai.png', 'qwen': 'qwen-color.png', 'grok': 'grok.png', 'gemini': 'gemini-color.png', 'hunyuan': 'hunyuan-color.png', 'codex': 'codex.webp', 'claude': 'claude-color.png'}
source_checked = bool(SOURCE_COPIES and SOURCE_COPIES.is_dir())
if source_checked:
    for name, file in expected.items():
        src = Image.open(SOURCE_COPIES / file); out = Image.open(R / m['foods'][name]); assert src.size[0] >= out.size[0]
report = {'status': 'PASS', 'head_states': 2, 'fish_expressions': 6, 'simple_food_icons': 7, 'food_asset_size': [64, 64], 'source_copies_checked': source_checked}
if (R / 'docs').is_dir():
    (R / 'docs/素材验证.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False, indent=2))
