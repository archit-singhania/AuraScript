"""Record the current tested artifacts; run after export-source.py."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent


def read(relative):
    return json.loads((root / relative).read_text(encoding="utf-8-sig"))


def fingerprint(relative):
    artifact = root / relative
    digest = hashlib.sha256()
    with artifact.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return {"path": relative, "bytes": artifact.stat().st_size,
            "sha256": digest.hexdigest().upper()}


source = read("test-results/electron-source/acceptance.json")
packaged = read("test-results/electron-packaged/acceptance.json")
match = read("test-results/package-source-match.json")
archive = read("test-results/source-archive.json")
if not (source.get("passed") and packaged.get("passed")
        and not match["mismatched"] and not match["privateEntries"]
        and archive["matchesCurrentSource"]):
    raise SystemExit("Release metadata requires passing current acceptance and artifact checks")

result = {
    "checkedAt": datetime.now(timezone.utc).isoformat(),
    "artifacts": [fingerprint("dist/AuraScript Setup 3.0.0.exe"),
                  fingerprint("dist/AuraScript-3.0.0-source.zip")],
    "sourceAcceptance": source,
    "packagedAcceptance": packaged,
    "sourceMatch": match,
    "sourceArchive": archive,
    "signing": "NotSigned",
    "guides": "Packaged documentation is a build-time snapshot; current verification is in the repository.",
}
cleanup = root / "test-results/temp-cleanup.json"
if cleanup.exists():
    result["temporaryCleanup"] = read("test-results/temp-cleanup.json")
(root / "dist/release-checksums.json").write_text(
    json.dumps(result, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"artifacts": result["artifacts"], "sourceGroups": len(source["checks"]),
                  "packagedGroups": len(packaged["checks"]), "matchingAssets": match["checked"]}, indent=2))
