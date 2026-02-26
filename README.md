# 沙丘领主 Demo（类九万亩风格）

这是一个可直接部署到 GitHub 的前端小游戏原型，画面和玩法参考你提供的截图风格：

- 沙漠地图 + 领地边框
- 主城与农庄建筑
- 左上角资源面板
- 点击建筑查看信息
- 点击“扩张领地”消耗金币扩地
- 资源自动增长

## 本地运行

直接打开 `index.html` 即可。

如果你想用本地服务（推荐）：

```bash
python3 -m http.server 8000
```

然后访问：`http://localhost:8000`

## 上传到 GitHub

把这几个文件推送到仓库根目录即可：

- `index.html`
- `styles.css`
- `game.js`
- `README.md`

GitHub Pages 也可以直接部署这个项目（纯静态页面）。
