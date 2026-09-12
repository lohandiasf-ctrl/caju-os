plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "net.cajutech.operacoes"
    compileSdk = 35

    defaultConfig {
        applicationId = "net.cajutech.operacoes"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.15"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Assinado com a chave de debug para permitir instalar o APK de teste
            // direto no celular, sem depender de uma keystore de release.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
}
