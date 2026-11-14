plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
}

kotlin { jvmToolchain(21) }

dependencies {
    implementation(libs.serialization.json)
    testImplementation(libs.junit.api)
    testRuntimeOnly(libs.junit.launcher)
}

// The rule file is shared with the web MVP; it is copied into the jar at build time.
val copyRules by tasks.registering(Copy::class) {
    from(rootProject.file("../shared/call_rules.json"))
    into(layout.buildDirectory.dir("generated/rules"))
}
sourceSets["main"].resources.srcDir(copyRules)

tasks.test {
    useJUnitPlatform()
    testLogging { events("failed"); showStandardStreams = true; exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL }
}
