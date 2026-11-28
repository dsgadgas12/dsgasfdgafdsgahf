import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
gifts=json.loads((ROOT/"frontend/src/data/gifts.json").read_text(encoding="utf-8"))
cases=json.loads((ROOT/"frontend/src/data/cases.json").read_text(encoding="utf-8"))
missing=[]
for gift in gifts:
    image=gift.get("image")
    if image and not (ROOT/"frontend/public"/image).exists():
        missing.append(gift["id"])
for case in cases:
    total=sum(x["weight_bp"] for x in case["items"])
    assert total==10000, f"{case['id']}: probabilities total {total}, expected 10000"
    for item in case["items"]:
        gift_id=item["gift_id"]
        if gift_id.startswith("stars-"):
            amount=int(gift_id.split("-",1)[1])
            assert amount>0, f"Invalid star prize {gift_id}"
            continue
        assert any(g["id"]==gift_id for g in gifts), f"Unknown gift {gift_id}"
print(f"Gift rows: {len(gifts)}")
print(f"Cases: {len(cases)}")
print(f"Missing model files: {missing}")
print("All case probability sums are 10000 basis points.")
