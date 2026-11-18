(() => {
'use strict';

const L = window.AccountingLocale;
const {groups, topics} = window.AccountingTutorialContent;
const icon = window.AccountingPersonalSpace.icon;
const searchIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.4 15.4 4.1 4.1" stroke-linecap="round"/></svg>';
const arrow = '<span aria-hidden="true">↗</span>';
const markup = L.markup;

class Tutorial {
  constructor(root) {
    this.root = root;
    this.group = 'all';
    this.query = '';
    this.selected = '';
    this.$ = selector => root.querySelector(selector);

    root.addEventListener('input', event => {
      if (!event.target.matches('.tutorial-search input')) return;
      this.query = event.target.value;
      this.renderResults();
    });
    root.addEventListener('change', event => {
      if (event.target.matches('.tutorial-select select')) this.selectTopic(event.target.value);
    });
    root.addEventListener('click', event => {
      const button = event.target.closest('[data-tutorial-group], [data-tutorial-topic], [data-tutorial-clear]');
      if (!button) return;
      if (button.hasAttribute('data-tutorial-clear')) {
        this.query = '';
        this.$('.tutorial-search input').value = '';
        this.renderResults();
        this.$('.tutorial-search input').focus();
      } else if (button.dataset.tutorialGroup) {
        this.group = button.dataset.tutorialGroup;
        this.selected = '';
        this.renderResults();
      } else {
        this.selectTopic(button.dataset.tutorialTopic);
        this.$('.tutorial-article h3').focus();
      }
    });
  }

  render({role = 'local', readOnly = false, catalog = []} = {}) {
    if (this.locale === L.current && this.role === role && this.readOnly === readOnly) return;
    const searchFocused = this.$('.tutorial-search input') === document.activeElement;
    this.locale = L.current;
    this.role = role;
    this.readOnly = readOnly;
    const roleTitles = {sales:'发票申请与糧单', hr:'工资表与糧单', employee:'查看与确认糧单'};
    this.restricted = Object.hasOwn(roleTitles, role);
    this.topics = this.restricted ? topics.filter(topic => topic.roles?.includes(role)) : [...topics, {
      id:'catalog', group:'record', title:'全部业务模板索引',
      path:'录入凭证 → 查找其他交易类型',
      intro:'按系统分类查找模板全名。在录入页搜索该名称，再按字段提示和分录预览核对。',
      link:['bookkeeping','打开业务模板'],
      catalog,
    }];
    this.topics = this.topics.map(topic => ({
      ...topic,
      search: this.searchText([
        topic.title, topic.path, topic.intro, topic.check, topic.example, topic.steps?.flat(),
        topic.catalog?.flatMap(({title, names}) => [title, ...names]),
      ].flat().filter(Boolean).join(' ')),
    }));
    const visibleGroups = groups.filter(group => this.topics.some(topic => topic.group === group.id));
    const key = this.root.id;
    this.root.innerHTML = markup(`
      <div class="tutorial-hero">
        <div class="tutorial-hero-copy">
          <h2>${roleTitles[role] || '从凭证到报表'}</h2>
          <p>${this.restricted ? '查找操作步骤，了解每个状态对应的下一步。' : '按业务找到操作入口、填写要求和复核步骤。也可以直接搜索付款、核销或审核。'}</p>
        </div>
        ${visibleGroups.length > 1 ? `<div class="tutorial-stages" role="group" aria-label="按业务阶段筛选">
          ${visibleGroups.map(group => `<button type="button" data-tutorial-group="${group.id}" aria-pressed="false">${icon(group.icon)}<span><strong>${group.title}</strong><small>${group.hint}</small></span>${arrow}</button>`).join('')}
        </div>` : ''}
      </div>
      ${!this.restricted || role==='sales' ? `<div class="tutorial-training-entry"><div><strong>财务实训</strong><p>用练习账套实操银行对账、月结、销售发票申请和管理复核。</p></div><a class="btn primary" href="index.html?training=1${L.current==='zh-HK'?'&amp;lang=zh-HK':''}#training" target="_blank" rel="noopener">打开练习关卡 <span aria-hidden="true">↗</span><span class="sr-only">（在新标签页打开）</span></a></div>` : ''}
      <div class="tutorial-reader">
        <aside class="tutorial-index" aria-label="教程目录">
          <label for="${key}-search" class="tutorial-label">搜索教程</label>
          <div class="tutorial-search">
            ${searchIcon}
            <input type="search" id="${key}-search" placeholder="输入业务名称或关键词" autocomplete="off" spellcheck="false">
            <button type="button" data-tutorial-clear aria-label="清除搜索" hidden>×</button>
          </div>
          <div class="tutorial-index-head">
            <h3 class="tutorial-label" id="${key}-toc">章节目录</h3>
            ${visibleGroups.length > 1 ? '<button type="button" class="tutorial-reset" data-tutorial-group="all" aria-pressed="true">全部章节</button>' : ''}
          </div>
          <p class="tutorial-count" role="status" aria-atomic="true"></p>
          <div class="tutorial-topics" role="group" aria-labelledby="${key}-toc"></div>
          <label class="tutorial-select"><span class="sr-only">选择教程章节</span><select></select></label>
        </aside>
        <article class="tutorial-article"></article>
      </div>`);
    this.$('.tutorial-search input').value = this.query;
    this.renderResults();
    if (searchFocused) this.$('.tutorial-search input').focus({preventScroll:true});
  }

  searchText(value) {
    return L.traditional(value.normalize('NFKC')).toLowerCase();
  }

  renderResults() {
    const terms = this.searchText(this.query).trim().split(/\s+/).filter(Boolean);
    const matches = this.topics.filter(topic => (this.group === 'all' || topic.group === this.group)
      && terms.every(term => topic.search.includes(term)));
    if (terms.length) {
      const titleHits = topic => terms.filter(term => this.searchText(topic.title).includes(term)).length;
      matches.sort((a, b) => titleHits(b) - titleHits(a));
    }
    if (!matches.some(topic => topic.id === this.selected)) this.selected = matches[0]?.id || '';
    for (const button of this.root.querySelectorAll('[data-tutorial-group]')) {
      button.setAttribute('aria-pressed', String(button.dataset.tutorialGroup === this.group));
    }
    this.$('[data-tutorial-clear]').hidden = !this.query;
    this.$('.tutorial-count').textContent = L.text(`${matches.length} 篇教程`);
    this.$('.tutorial-topics').innerHTML = markup(matches.map(topic =>
      `<button type="button" data-tutorial-topic="${topic.id}">${topic.title}<span aria-hidden="true">›</span></button>`).join(''));
    const chooser = this.$('.tutorial-select');
    chooser.hidden = !matches.length;
    chooser.querySelector('select').innerHTML = markup(matches.map(topic =>
      `<option value="${topic.id}">${topic.title}</option>`).join(''));
    this.renderArticle();
  }

  selectTopic(id) {
    if (id === this.selected || !this.topics.some(topic => topic.id === id)) return;
    this.selected = id;
    this.renderArticle();
  }

  renderArticle() {
    const article = this.$('.tutorial-article');
    for (const button of this.root.querySelectorAll('[data-tutorial-topic]')) {
      if (button.dataset.tutorialTopic === this.selected) button.setAttribute('aria-current','true');
      else button.removeAttribute('aria-current');
    }
    this.$('.tutorial-select select').value = this.selected;
    const topic = this.topics.find(item => item.id === this.selected);
    if (!topic) {
      const hint = this.restricted ? '试试更短的关键词。' : '试试更短的关键词，或点「全部章节」扩大搜索范围。';
      article.innerHTML = markup(`<h3>没有找到匹配的教程</h3><p>${hint}</p>`);
      return;
    }
    const group = groups.find(item => item.id === topic.group);
    const [route, label] = topic.link || [];
    const link = route && !this.restricted && !(route === 'bookkeeping' && this.readOnly)
      && !(route === 'payroll' && this.role === 'local');
    const accountFeature = ['invoice-request','invoice-review','payroll-prep','payslip','payroll-post'].includes(topic.id);
    article.innerHTML = markup(`
      <div class="tutorial-article-head">
        <p class="tutorial-category">${icon(group.icon)}${group.title}</p>
        <h3 tabindex="-1">${topic.title}</h3>
        <p class="tutorial-intro">${topic.intro}</p>
        <div class="tutorial-path"><span>操作路径</span> ${topic.path}</div>
      </div>
      ${topic.steps ? `<ol class="tutorial-steps">${topic.steps.map(([title, text]) => `<li><div><h4>${title}</h4><p>${text}</p></div></li>`).join('')}</ol>` : ''}
      ${topic.catalog ? `<div class="tutorial-catalog">${topic.catalog.map(({title, names}) => `<details><summary>${title} <span>${names.length} 种</span></summary><ul>${names.map(name => `<li>${name}</li>`).join('')}</ul></details>`).join('')}</div>` : ''}
      ${topic.example ? `<div class="tutorial-aside"><h4>举个例子</h4><p>${topic.example}</p></div>` : ''}
      ${topic.check ? `<div class="tutorial-aside tutorial-check"><h4>复核要点</h4><p>${topic.check}</p></div>` : ''}
      ${accountFeature && this.role === 'local' ? '<p class="tutorial-mode">此流程适用于登录公司账号后的工作台。</p>' : ''}
      ${link ? `<a class="tutorial-open" href="index.html#${route}" data-act="section" data-v="${route}">${label} ${arrow}</a>` : ''}`);
  }
}

window.AccountingTutorial = Tutorial;
})();
