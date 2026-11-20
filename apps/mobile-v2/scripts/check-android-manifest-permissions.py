#!/usr/bin/env python3
"""Check the final manifest dumped from an AAB with bundletool.

Usage: python3 scripts/check-android-manifest-permissions.py manifest.xml
The final AAB manifest is required; a prebuild manifest is insufficient.
"""

import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

ANDROID = "{http://schemas.android.com/apk/res/android}"
TOOLS = "{http://schemas.android.com/tools}"
REQUIRED = {
    "android.permission.CAMERA",
    "android.permission.RECORD_AUDIO",
    "android.permission.ACCESS_FINE_LOCATION",
    "android.permission.POST_NOTIFICATIONS",
}
FORBIDDEN = {
    "android.permission.SYSTEM_ALERT_WINDOW",
    "android.permission.READ_MEDIA_IMAGES",
    "android.permission.READ_MEDIA_VIDEO",
    "android.permission.READ_MEDIA_AUDIO",
    "android.permission.READ_MEDIA_VISUAL_USER_SELECTED",
    "android.permission.READ_EXTERNAL_STORAGE",
    "android.permission.WRITE_EXTERNAL_STORAGE",
    "com.google.android.gms.permission.AD_ID",
}


def check(path):
    root = ET.parse(path).getroot()
    if root.tag != "manifest" or root.get("package") != "com.haksan.mobileapp":
        raise ValueError("Expected the com.haksan.mobileapp manifest")
    permissions = {
        node.get(ANDROID + "name")
        for node in root
        if node.tag in {"uses-permission", "uses-permission-sdk-23"}
        and node.get(TOOLS + "node") != "remove"
    }
    missing = sorted(REQUIRED - permissions)
    forbidden = sorted(FORBIDDEN & permissions)
    if missing or forbidden:
        raise ValueError(json.dumps({"missingRequired": missing, "forbidden": forbidden}))
    return {"package": root.get("package"), "permissionCount": len(permissions),
            "requiredPermissions": sorted(REQUIRED), "forbiddenPermissions": []}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("Usage: check-android-manifest-permissions.py manifest.xml")
    try:
        print(json.dumps(check(Path(sys.argv[1])), ensure_ascii=False))
    except (OSError, ET.ParseError, ValueError) as error:
        sys.exit(str(error))
