package com.bingoyes.bingojp

import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/**
 * Android 端的壳。只做一件事：**把系统栏的高度让给正文**。
 *
 * 模板默认就是 edge-to-edge（Android 15 起 targetSdk 35+ 也强制如此），于是 WebView
 * 会一直铺到状态栏与手势条底下：卷头的课名会被状态栏压住，正文最后一句会被手势条盖住。
 * 这里把 systemBars + 刘海的高度取出来，作为内边距加在 content 上——WebView 于是整块
 * 退进安全区以内，而**系统栏那两条留成夜色**（windowBackground，见 values/themes.xml），
 * 与 CSS 里纸面之外的夜色连成一片（见 src/styles/compact.css 的 --night）。
 *
 * 系统栏图标**固定浅色**（SystemBarStyle.dark）：底是夜色，深色图标落在上面什么也看不见。
 * 这一版只有一套浅色配色（米白纸面），所以也不跟系统暗色模式翻转。
 *
 * `enableEdgeToEdge()` 必须在 `super.onCreate()` **之前**调用（模板就是这么写的）：
 * 它要在 Activity 建窗口之前把系统栏样式交代下去。
 */
class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
    )
    super.onCreate(savedInstanceState)

    // android.R.id.content 是任何 Activity 都有的那层 FrameLayout；WebView 无论
    // 是 setContentView 进来的还是后来 addView 进去的，都在它里面——所以给它加内边距
    // 就等于给整块内容加内边距，不必去猜 wry 的视图层级。
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
      )
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      // 返回原样的 insets：键盘 / 无障碍那一套还要往下传，这里只是让个位。
      insets
    }

    // 模拟器上 WebView 整块画不出来（界面全空、App 没崩、日志里 gfxstream 刷
    // GLESv2Imp error 0x502），是宿主 GL 通道的坑：普通 App 照常显示，只有走
    // Chromium 硬件合成的 WebView 会白屏。给 WebView 单独退回**软件栅格**就绕开了
    // （代价只是这一块的合成慢一点）。只在模拟器上这么做，真机仍然是硬件加速。
    if (isEmulator()) {
      applySoftwareLayerToWebView(content, 0)
    }
  }

  /**
   * 找 WebView 并把它切成软件栅格。
   *
   * wry 建 WebView 是**异步**的：onCreate 里它常常还没挂进视图树，第一枪必然落空——
   * 所以要重试几十次（每 150ms 一次，够 boot 那几百毫秒了）。始终找不到就当没这回事，
   * 保持硬件加速，不会比不加这段更糟。
   */
  private fun applySoftwareLayerToWebView(root: View, attempt: Int) {
    val web = findWebView(root)
    if (web != null) {
      web.setLayerType(View.LAYER_TYPE_SOFTWARE, null)
      Log.i(TAG, "emulator: WebView -> software layer (attempt $attempt)")
    } else if (attempt < 20) {
      root.postDelayed({ applySoftwareLayerToWebView(root, attempt + 1) }, 150)
    } else {
      Log.i(TAG, "emulator: no WebView found, keeping hardware acceleration")
    }
  }

  /** 只认「这是模拟器」这一件事，宁可漏判（漏判＝照旧硬件加速，不会更糟）。 */
  private fun isEmulator(): Boolean {
    val fp = Build.FINGERPRINT
    return fp.contains("generic") ||
      fp.contains("emulator") ||
      Build.MODEL.contains("sdk_gphone") ||
      Build.MODEL.contains("Emulator") ||
      Build.HARDWARE.contains("ranchu") ||
      Build.HARDWARE.contains("goldfish") ||
      Build.PRODUCT.contains("sdk_gphone")
  }

  /** wry 把 WebView 挂在哪个层级里没写进文档，所以按类型找一遍。 */
  private fun findWebView(root: View): WebView? {
    if (root is WebView) return root
    if (root is ViewGroup) {
      for (i in 0 until root.childCount) {
        findWebView(root.getChildAt(i))?.let { return it }
      }
    }
    return null
  }

  private companion object {
    const val TAG = "BingoJP"
  }
}
