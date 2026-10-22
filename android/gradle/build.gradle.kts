buildscript {
    repositories { google(); mavenCentral() }
    dependencies {
        // ZXing-C++ 3.1.1 ships Kotlin 2.3 metadata. Use its supported D8/R8
        // rather than emitting thousands of metadata rewrite warnings or
        // risking a release-only shrinker failure. Gradle remains 8.14.3.
        classpath("com.android.tools.build:gradle:8.13.2")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.2.10")
    }
}
allprojects { repositories { google(); mavenCentral() } }
tasks.register("clean").configure { delete("build") }
