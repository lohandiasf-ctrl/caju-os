package net.cajutech.operacoes

import android.Manifest
import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceError
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import java.io.File

/**
 * Shell Android do Caju OS: carrega https://operacoes.cajutech.net num WebView,
 * como o app desktop (Tauri) faz com a mesma URL. O objetivo aqui é ter um APK
 * instalável para teste em campo, não um app nativo separado.
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var refresh: SwipeRefreshLayout
    private lateinit var offline: LinearLayout
    private lateinit var fullscreenContainer: FrameLayout

    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var cameraOutputUri: Uri? = null
    private var pendingPermissionRequest: PermissionRequest? = null
    private var pendingGeolocationOrigin: String? = null
    private var pendingGeolocationCallback: GeolocationPermissions.Callback? = null
    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null
    private var loadFailed = false

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val uris = when {
            result.resultCode != RESULT_OK -> null
            result.data?.data != null -> arrayOf(result.data!!.data!!)
            result.data?.clipData != null -> {
                val clip = result.data!!.clipData!!
                Array(clip.itemCount) { clip.getItemAt(it).uri }
            }
            cameraOutputUri != null -> arrayOf(cameraOutputUri!!)
            else -> null
        }
        filePathCallback?.onReceiveValue(uris)
        filePathCallback = null
        cameraOutputUri = null
    }

    private val webPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { granted ->
        val request = pendingPermissionRequest
        pendingPermissionRequest = null
        if (request != null) {
            if (granted.values.all { it }) request.grant(request.resources) else request.deny()
        }

        val origin = pendingGeolocationOrigin
        val callback = pendingGeolocationCallback
        pendingGeolocationOrigin = null
        pendingGeolocationCallback = null
        if (origin != null && callback != null) {
            callback.invoke(origin, granted.values.all { it }, false)
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webview)
        refresh = findViewById(R.id.refresh)
        offline = findViewById(R.id.offline)
        fullscreenContainer = findViewById(R.id.fullscreen)
        findViewById<Button>(R.id.retry).setOnClickListener { reload() }
        refresh.setOnRefreshListener { reload() }

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            setGeolocationEnabled(true)
            loadWithOverviewMode = true
            useWideViewPort = true
            cacheMode = WebSettings.LOAD_DEFAULT
            userAgentString = "$userAgentString CajuOS-Android/${BuildConfig.VERSION_NAME}"
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true)

        webView.webViewClient = CajuWebViewClient()
        webView.webChromeClient = CajuWebChromeClient()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (customView != null) {
                    webView.webChromeClient?.onHideCustomView()
                } else if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            webView.loadUrl(START_URL)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            webPermissionLauncher.launch(arrayOf(Manifest.permission.POST_NOTIFICATIONS))
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    private fun reload() {
        loadFailed = false
        offline.visibility = View.GONE
        webView.loadUrl(START_URL)
    }

    private fun isInternal(url: String): Boolean {
        val host = Uri.parse(url).host ?: return false
        return host == APP_HOST || host.endsWith(".$APP_HOST")
    }

    private fun openExternally(url: String) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (_: ActivityNotFoundException) {
            // Sem app para abrir o link: ignorar em vez de derrubar o fluxo.
        }
    }

    private inner class CajuWebViewClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url.toString()
            if (url.startsWith("http://") || url.startsWith("https://")) {
                if (isInternal(url)) return false
                openExternally(url)
                return true
            }
            // tel:, mailto:, whatsapp:, geo: etc.
            openExternally(url)
            return true
        }

        override fun onPageFinished(view: WebView, url: String) {
            refresh.isRefreshing = false
            offline.visibility = if (loadFailed) View.VISIBLE else View.GONE
        }

        override fun onReceivedError(
            view: WebView,
            request: WebResourceRequest,
            error: WebResourceError
        ) {
            if (request.isForMainFrame) {
                loadFailed = true
                refresh.isRefreshing = false
                offline.visibility = View.VISIBLE
            }
        }

        override fun onPageStarted(view: WebView, url: String, favicon: android.graphics.Bitmap?) {
            loadFailed = false
        }
    }

    private inner class CajuWebChromeClient : WebChromeClient() {
        override fun onPermissionRequest(request: PermissionRequest) {
            val needed = mutableListOf<String>()
            request.resources.forEach { resource ->
                when (resource) {
                    PermissionRequest.RESOURCE_VIDEO_CAPTURE -> needed.add(Manifest.permission.CAMERA)
                    PermissionRequest.RESOURCE_AUDIO_CAPTURE -> needed.add(Manifest.permission.RECORD_AUDIO)
                }
            }
            val missing = needed.filter {
                ContextCompat.checkSelfPermission(this@MainActivity, it) != PackageManager.PERMISSION_GRANTED
            }
            if (missing.isEmpty()) {
                request.grant(request.resources)
            } else {
                pendingPermissionRequest = request
                webPermissionLauncher.launch(missing.toTypedArray())
            }
        }

        override fun onGeolocationPermissionsShowPrompt(
            origin: String,
            callback: GeolocationPermissions.Callback
        ) {
            val granted = ContextCompat.checkSelfPermission(
                this@MainActivity, Manifest.permission.ACCESS_FINE_LOCATION
            ) == PackageManager.PERMISSION_GRANTED
            if (granted) {
                callback.invoke(origin, true, false)
            } else {
                pendingGeolocationOrigin = origin
                pendingGeolocationCallback = callback
                webPermissionLauncher.launch(
                    arrayOf(
                        Manifest.permission.ACCESS_FINE_LOCATION,
                        Manifest.permission.ACCESS_COARSE_LOCATION
                    )
                )
            }
        }

        override fun onShowFileChooser(
            view: WebView,
            callback: ValueCallback<Array<Uri>>,
            params: FileChooserParams
        ): Boolean {
            filePathCallback?.onReceiveValue(null)
            filePathCallback = callback

            val contentIntent = params.createIntent().apply {
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            val chooser = Intent(Intent.ACTION_CHOOSER).apply {
                putExtra(Intent.EXTRA_INTENT, contentIntent)
                putExtra(Intent.EXTRA_TITLE, getString(R.string.choose_file))
            }

            cameraIntent()?.let { camera ->
                chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(camera))
            }

            return try {
                fileChooserLauncher.launch(chooser)
                true
            } catch (_: ActivityNotFoundException) {
                filePathCallback = null
                false
            }
        }

        /** Captura de foto direto da câmera — o fluxo de evidência depende disso. */
        private fun cameraIntent(): Intent? {
            if (ContextCompat.checkSelfPermission(this@MainActivity, Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED
            ) {
                webPermissionLauncher.launch(arrayOf(Manifest.permission.CAMERA))
                return null
            }
            return try {
                val dir = File(cacheDir, "capturas").apply { mkdirs() }
                val photo = File(dir, "foto-${System.currentTimeMillis()}.jpg")
                val uri = FileProvider.getUriForFile(
                    this@MainActivity, "$packageName.fileprovider", photo
                )
                cameraOutputUri = uri
                Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE).apply {
                    putExtra(android.provider.MediaStore.EXTRA_OUTPUT, uri)
                    addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                }
            } catch (_: Exception) {
                cameraOutputUri = null
                null
            }
        }

        override fun onShowCustomView(view: View, callback: CustomViewCallback) {
            if (customView != null) {
                callback.onCustomViewHidden()
                return
            }
            customView = view
            customViewCallback = callback
            fullscreenContainer.addView(
                view,
                ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            )
            fullscreenContainer.visibility = View.VISIBLE
            refresh.visibility = View.GONE
        }

        override fun onHideCustomView() {
            customView?.let { fullscreenContainer.removeView(it) }
            customView = null
            fullscreenContainer.visibility = View.GONE
            refresh.visibility = View.VISIBLE
            customViewCallback?.onCustomViewHidden()
            customViewCallback = null
        }

        override fun onConsoleMessage(message: ConsoleMessage): Boolean = true
    }

    companion object {
        private const val APP_HOST = "operacoes.cajutech.net"
        private const val START_URL = "https://$APP_HOST/"
    }
}
