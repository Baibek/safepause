pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    // mavenLocal() holds artifacts fetched by tools/fetch-missing.sh when Maven Central rate-limits Gradle
    repositories { mavenLocal(); google(); mavenCentral() }
}
rootProject.name = "safepause-guard"
include(":detector", ":app")
