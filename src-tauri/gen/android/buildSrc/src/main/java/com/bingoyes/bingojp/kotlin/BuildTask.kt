import java.io.File
import org.apache.tools.ant.taskdefs.condition.Os
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.logging.LogLevel
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.TaskAction

/**
 * 把 Rust 侧编成 .so 的那一步（Gradle 侧的名字是 `rustBuild<Abi><Debug|Release>`）。
 *
 * 这个文件是 `tauri android init` 生成的，**本仓库动过一处**（见 runTauriCli 里的说明）：
 * 生成的版本跑的是 `node tauri android android-studio-script`，而 node 不做名字解析
 * ——它只会在工作目录（src-tauri）下找一个名为 `tauri` 的文件，于是报
 * `Cannot find module '...\src-tauri\tauri'`。这里把参数换成随仓库装好的 CLI 入口
 * `node_modules/@tauri-apps/cli/tauri.js` 的绝对路径。
 *
 * 重新 `tauri android init` 会把这个文件覆盖回去，构建时会再撞上同一条报错——
 * 那时照上面这段改回来即可（README 的「Android」一节也记了这一条）。
 */
open class BuildTask : DefaultTask() {
    @Input
    var rootDirRel: String? = null
    @Input
    var target: String? = null
    @Input
    var release: Boolean? = null

    @TaskAction
    fun assemble() {
        val executable = """D:\nvm4w\nodejs\node""";
        try {
            runTauriCli(executable)
        } catch (e: Exception) {
            if (Os.isFamily(Os.FAMILY_WINDOWS)) {
                // Try different Windows-specific extensions
                val fallbacks = listOf(
                    "$executable.exe",
                    "$executable.cmd",
                    "$executable.bat",
                )

                var lastException: Exception = e
                for (fallback in fallbacks) {
                    try {
                        runTauriCli(fallback)
                        return
                    } catch (fallbackException: Exception) {
                        lastException = fallbackException
                    }
                }
                throw lastException
            } else {
                throw e;
            }
        }
    }

    fun runTauriCli(executable: String) {
        val rootDirRel = rootDirRel ?: throw GradleException("rootDirRel cannot be null")
        val target = target ?: throw GradleException("target cannot be null")
        val release = release ?: throw GradleException("release cannot be null")

        // 工作目录＝src-tauri（rootDirRel 是相对 app/ 的 ../../../）
        val workDir = File(project.projectDir, rootDirRel)
        // CLI 入口：仓库根下的 node_modules（工作目录的上一级）。写成绝对路径交给 node，
        // 不做 PATH 解析——理由见文件头。找不到就直接报错，别等 node 抛一句看不懂的
        // 「Cannot find module」。
        val cli = File(workDir, "../node_modules/@tauri-apps/cli/tauri.js")
        if (!cli.isFile) {
            throw GradleException("找不到 Tauri CLI：${cli.absolutePath}。先在仓库根目录跑 npm install。")
        }
        val args = listOf(cli.absolutePath, "android", "android-studio-script");

        project.exec {
            workingDir(workDir)
            executable(executable)
            args(args)
            if (project.logger.isEnabled(LogLevel.DEBUG)) {
                args("-vv")
            } else if (project.logger.isEnabled(LogLevel.INFO)) {
                args("-v")
            }
            if (release) {
                args("--release")
            }
            args(listOf("--target", target))
        }.assertNormalExitValue()
    }
}
