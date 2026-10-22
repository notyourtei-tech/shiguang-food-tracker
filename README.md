# 食光 Food Tracker

面向朋友和公开访客的食品库存与消耗记录网站。每位用户用自己的邮箱注册、验证后登录；食材、消耗记录和调味品库存保存在 Supabase PostgreSQL 中，并由行级安全策略隔离。

## 已实现

- 邮箱注册、验证提示、登录和退出
- 购买食材、记录消耗、消耗百分比、临期提示
- 食用油、盐、生抽等调味品库存与“缺少关键调味料，不建议做”拦截
- 缺三种以上常用调味料时的补货提醒
- 每次消耗写入不可由浏览器删除的事件记录；食材记录采用软删除设计
- Supabase RLS：用户只能读写自己的数据
- GitHub Actions 部署到 GitHub Pages

## 上线前配置

1. 在 Supabase 项目中执行 `supabase/migrations/001_food_tracker.sql`。
2. 在 **Authentication → URL Configuration** 添加 GitHub Pages 网址和本地预览网址。
3. 在 **Authentication → Providers → Email** 开启邮箱确认；生产环境请配置自有 SMTP，保证验证邮件可靠送达。
4. 在 Supabase 项目设置中复制 **Project URL** 和 **Publishable key**，填入 `config.js`。这两个值可公开；绝不能填 `service_role` 密钥。
5. 在仓库 **Settings → Pages** 将 Source 设为 **GitHub Actions**。推送 `main` 后会自动发布。

## 数据保护说明

所有实际记录存放在云端 PostgreSQL，而非浏览器本地存储。RLS 让浏览器无法读取其他用户数据；消耗写入事件表，删除食材只标记删除。仍建议在 Supabase 中启用适合项目套餐的数据库备份和 PITR（时间点恢复）；没有任何单一云服务可以诚实地承诺绝对零风险的数据丢失。

