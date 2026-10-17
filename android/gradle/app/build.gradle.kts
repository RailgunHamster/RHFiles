import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

// One signing key for every build type.
//
// If debug and release were signed with different keys, Android would refuse to
// update one build over the other and the app would have to be uninstalled
// first — which also wipes the search index and all settings. Sharing the key
// keeps a debug build a drop-in replacement for a release build.
val keystoreProperties = Properties().apply {
    val propFile = rootProject.file("keystore.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}
val keystorePath = keystoreProperties.getProperty("storeFile")
val hasSigningKey = !keystorePath.isNullOrBlank() && file(keystorePath).exists()
// A lower manifest version lets an emulator exercise a real upgrade using the
// identical minified runtime. Never enabled by the production build/publisher.
val updateProbeCode = providers.gradleProperty("rhfilesUpdateProbeCode").orNull?.toInt()
require(updateProbeCode == null || (providers.gradleProperty("rhfilesReleaseProbe").isPresent && updateProbeCode > 0)) {
    "Update probe versions require rhfilesReleaseProbe and a positive code"
}

android {
    if (providers.gradleProperty("rhfilesReleaseProbe").isPresent) {
        testBuildType = "release"
        defaultConfig { testInstrumentationRunner = "com.railgunhamster.rhfiles.SmbUpdateInstrumentation" }
    }
    compileSdk = 36
    namespace = "com.railgunhamster.rhfiles"
    sourceSets.getByName("main").assets.srcDir(rootProject.file("../../../reader"))
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "com.railgunhamster.rhfiles"
        minSdk = 24
        targetSdk = 36
        versionCode = updateProbeCode ?: tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0") + if (updateProbeCode != null) "-update-probe" else ""
    }
    signingConfigs {
        if (hasSigningKey) {
            create("rhfiles") {
                storeFile = file(keystorePath!!)
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            if (hasSigningKey) {
                signingConfig = signingConfigs.getByName("rhfiles")
            }
            packaging {
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            isMinifyEnabled = true
            if (hasSigningKey) {
                signingConfig = signingConfigs.getByName("rhfiles")
            }
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
    compileOptions {
        isCoreLibraryDesugaringEnabled = true
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    packaging {
        resources.excludes += "META-INF/versions/**/OSGI-INF/MANIFEST.MF"
        resources.merges += setOf("META-INF/LICENSE", "META-INF/NOTICE", "META-INF/LICENSE.txt", "META-INF/NOTICE.txt", "META-INF/DEPENDENCIES")
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.5")
    implementation("androidx.documentfile:documentfile:1.1.0")
    implementation("org.apache.commons:commons-compress:1.28.0")
    implementation("org.tukaani:xz:1.10")
    implementation("commons-net:commons-net:3.13.0")
    implementation("com.hierynomus:smbj:0.14.0")
    implementation("com.rapid7.client:dcerpc:0.12.13") { exclude(group="org.bouncycastle") }
    implementation("org.bouncycastle:bcprov-jdk18on:1.83")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("org.apache.ftpserver:ftpserver-core:1.2.1")
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.window:window:1.5.1")
    implementation("androidx.window:window-java:1.5.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.media3:media3-exoplayer:1.11.1")
    implementation("androidx.media3:media3-ui:1.11.1")
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.ow2.asm:asm:9.8")
    testImplementation("org.json:json:20250517")
    testImplementation("org.robolectric:robolectric:4.16.1")
    testImplementation("com.squareup.okhttp3:mockwebserver:4.12.0")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")
