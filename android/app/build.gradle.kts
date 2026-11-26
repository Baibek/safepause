plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "kz.safepause.guard"
    compileSdk = 37
    defaultConfig {
        applicationId = "kz.safepause.guard"
        minSdk = 29
        targetSdk = 35
        versionCode = 1
        versionName = "0.1"
        // Phones only: drops the x86/mips copies of the native speech libraries (~40 MB)
        ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a") }
    }
    buildFeatures { compose = true }
    flavorDimensions += "sms"
    productFlavors {
        create("full") { dimension = "sms" }
        // no SEND_SMS: fewer Play Protect blocks when sideloading; guardian SMS is not sent
        create("lite") { dimension = "sms"; applicationIdSuffix = ".lite"; versionNameSuffix = "-lite" }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    packaging { resources.excludes += setOf("META-INF/*") }
    testOptions { unitTests.isReturnDefaultValues = true }
}

dependencies {
    implementation(project(":detector"))
    implementation(libs.core.ktx)
    implementation(libs.activity.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.material3)
    implementation(libs.compose.ui)
    implementation(libs.compose.tooling.preview)
    implementation(libs.coroutines.android)
    implementation(libs.serialization.json)
    implementation(libs.vosk)
    implementation(libs.anthropic)
    implementation(libs.security.crypto)
    implementation(libs.mlkit.face)
    implementation("net.java.dev.jna:jna:${libs.versions.jna.get()}@aar")
    testImplementation(libs.junit4)
    testImplementation(libs.coroutines.test)
}
