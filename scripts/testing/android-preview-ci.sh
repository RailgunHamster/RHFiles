#!/usr/bin/env bash
set -euo pipefail
serial=emulator-5554
adb="$ANDROID_HOME/platform-tools/adb"
test "$("$adb" -s "$serial" shell getprop ro.kernel.qemu | tr -d '\r')" = 1
test "$("$adb" -s "$serial" shell getprop ro.boot.qemu.avd_name | tr -d '\r')" = RHFilesPreviewCI
node --input-type=module -e 'import fs from "node:fs";fs.writeFileSync("test-artifacts/android-ci-emulator.json",JSON.stringify({serial:"emulator-5554",avd:"RHFilesPreviewCI",readOnly:true}));'
"$adb" -s "$serial" install -r test-artifacts/android-ci-apks/RHFiles-Android-QA-x86_64.apk
"$adb" -s "$serial" install -r test-artifacts/android-ci-apks/RHFiles-Android-QA-test.apk
"$adb" -s "$serial" shell pm grant com.railgunhamster.rhfiles android.permission.POST_NOTIFICATIONS
"$adb" -s "$serial" shell wm dismiss-keyguard
"$adb" -s "$serial" shell am instrument -w -e bootstrapOnly true com.railgunhamster.rhfiles.test/com.railgunhamster.rhfiles.AutomationInstrumentation | tee test-artifacts/android-preview-bootstrap.log
node --input-type=module -e 'import fs from "node:fs";if(!fs.readFileSync("test-artifacts/android-preview-bootstrap.log","utf8").includes("INSTRUMENTATION_RESULT: pass=true"))throw Error("Emulator automation bootstrap did not pass");'
"$adb" -s "$serial" shell am start -W -n com.railgunhamster.rhfiles/.MainActivity
export RHFILES_TEST_HEADLESS_SERVICE="$PWD/target/debug/examples/preview_fixture"
node scripts/testing/android-preview-native-check.mjs "$serial" test-artifacts/android-ci-apks/RHFiles-Android-QA-x86_64.apk test-artifacts/preview-venv/bin/python test-artifacts/android-ci-emulator.json 2>&1 | tee test-artifacts/android-preview-native.log
