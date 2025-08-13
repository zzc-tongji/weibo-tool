import * as fs from 'node:fs';
import * as path from 'node:path';
import * as process from 'node:process';
//
import { ArgumentParser } from 'argparse';
import check from 'check-types';
import puppeteer from 'puppeteer-extra';
import Stealth from 'puppeteer-extra-plugin-stealth';
//
import * as setting from './setting.js';
import { waitForUserLogin } from './utils.js';

const main = async () => {
  //
  // get parameter
  //
  const parser = new ArgumentParser({
    description: 'Weibo Scrapper',
  });
  parser.add_argument('--url', '-u', { help: 'feed url for fetching, "P" as user\'s post(微博), "C" as user\'s collection(收藏), "L" as user\'s liked(点赞)' });
  parser.add_argument('--setting', '-s', { help: 'setting for fetching, absolute path OR relative path based on "--wkdir"', default: './setting.weibo-tool.json' });
  parser.add_argument('--wkdir', '-w', { help: 'working directory', required: true });
  const argv = parser.parse_args();
  // setting
  let allConfig = null;
  try {
    const w = path.resolve(argv.wkdir);
    const s = path.isAbsolute(argv.setting) ? argv.setting : path.resolve(w, argv.setting);
    //
    setting.post(JSON.parse(fs.readFileSync(s, { encoding: 'utf-8' })));
    allConfig = setting.get();
    allConfig.runtime = { wkdir: w, setting: s };
    //
    const d = allConfig?.puppeteerBrowserOption?.userDataDir || '';
    if (check.not.emptyString(d)) {
      allConfig.runtime.chromeData = path.isAbsolute(d) ? d : path.resolve(w, d);
    }
    const u = argv.url || '';
    if (check.not.emptyString(u)) {
      allConfig.runtime.feedUrl = u;
    }
  } catch (error) {
    console.log(`invalid parameter | --setting="${argv.setting}" --wkdir="${argv.wkdir}" | ${error.message}`);
    return 1;
  }
  // default value
  const browserOption = allConfig.puppeteerBrowserOption ? { ...allConfig.puppeteerBrowserOption } : {};
  if (allConfig.runtime.chromeData) {
    browserOption.userDataDir = allConfig.runtime.chromeData;
  }
  const scrapeOption = {
    maxFetchIntervalMs: 10000,
    maxPostCount: -1,
    scrollPixel: 120,
    scrollPixelOffset: 16,
    scrollIntervalMs: 100,
    scrollIntervalMsOffset: 16,
    ...allConfig.scrape,
  };
  if (allConfig.runtime.feedUrl) {
    scrapeOption.feedUrl = allConfig.runtime.feedUrl;
  }
  if (!scrapeOption.feedUrl) {
    console.log('main | feed url not found | check parameter [--url] OR setting [.scrape.feedUrl]');
    process.exit(1);
  }
  //
  // go to main page
  //
  puppeteer.use(Stealth());
  const browser = await puppeteer.launch(browserOption);
  const page = (await browser.pages())[0] || await browser.newPage();
  await page.goto('https://weibo.com/', { waitUntil: 'networkidle2', timeout: 60000 });
  //
  // login and save cookie
  //
  const { userId, cookieParam, cookieHeader } = await waitForUserLogin({ page, pollingTimeMs: 10000 });
  fs.writeFileSync(path.resolve(allConfig.runtime.wkdir, 'cookie.weibo.json'), JSON.stringify(cookieParam, null, 2), { encoding: 'utf-8' });
  fs.writeFileSync(path.resolve(allConfig.runtime.wkdir, 'cookie.weibo.header.txt'), cookieHeader, { encoding: 'utf-8' });
  //
  // feed page url and output file
  //
  if (scrapeOption.feedUrl === 'P') {
    scrapeOption.feedUrl = `https://weibo.com/u/${userId}`;
  } else if (scrapeOption.feedUrl === 'C') {
    scrapeOption.feedUrl = `https://weibo.com/u/page/fav/${userId}`;
  } else if (scrapeOption.feedUrl === 'L') {
    scrapeOption.feedUrl = `https://weibo.com/u/page/like/${userId}`;
  }
  //
  let outputFileName = `data.weibo.${Date.now()}`;
  let temp;
  // eslint-disable-next-line no-cond-assign
  if (temp = /weibo.com\/u\/page\/(fav|like)\/(.*)$/.exec(scrapeOption.feedUrl)) {
    outputFileName = `data.weibo.${temp[2]}.${temp[1]}`;
    // eslint-disable-next-line no-cond-assign
  } else if (temp = /weibo.com\/u\/(.*)$/.exec(scrapeOption.feedUrl)) {
    outputFileName = `data.weibo.${temp[1]}.post`;
  }
  //
  // prepare post url collection
  //
  const postUrlMap = {};
  let postUrlMapLength = 0;
  let responseTimer = null;
  const finishCallback = () => {
    //
    // [END] stop scroll and close browser
    //
    page.evaluate(() => {
      window._scrollTimer && clearTimeout(window._scrollTimer);
    }).then(() => {
      page.off('response');
      console.log(`main | [${postUrlMapLength}] post(s) scraped`);
      //
      const keyList = Object.keys(postUrlMap);
      const postUrlMapRev = {};
      for (let i = keyList.length - 1; i >= 0; i--) {
        postUrlMapRev[keyList[i]] = postUrlMap[keyList[i]];
      }
      //
      const json = `${allConfig.runtime.wkdir}${path.sep}${outputFileName}.json`;
      fs.writeFileSync(json, JSON.stringify(postUrlMapRev, null, 2), { encoding: 'utf-8' });
      console.log(`main | data locates at [${json}]`);
      const txt = `${allConfig.runtime.wkdir}${path.sep}${outputFileName}.txt`;
      fs.writeFileSync(txt, Object.values(postUrlMapRev).join('\n'), { encoding: 'utf-8' });
      console.log(`main | data locates at [${txt}]`);
      //
      console.log('main | done');
      return browser.close();
    }).then(() => process.exit(0));
  };
  page.on('response', async (response) => {
    // [SCROLL] handle page event 'response'
    //
    // filter response of api request
    //
    // post (微博):        https://weibo.com/ajax/statuses/mymblog
    // collection (收藏):  https://weibo.com/ajax/favorites/all_fav
    // liked (点赞):       https://weibo.com/ajax/statuses/likelist
    if (![ 'GET', 'POST' ].includes(response.request().method().toUpperCase()) || !/^https:\/\/weibo.com\/ajax\/(statuses|favorites)\/(mymblog|all_fav|likelist)/.test(response.url()) || !response.ok()) {
      return;
    }
    //
    // collect url
    //
    const responseBody = await response.json();
    const x = responseBody?.data?.list || responseBody?.data?.status || responseBody?.statuses || [];
    if (x.length <= 0) {
      console.log(`main | empty list | url [${response.url()}] | response ${JSON.stringify(responseBody)}`);
      finishCallback();
      return;
    }
    x.map((p) => {
      if (!p?.idstr) {
        return;
      }
      if (!p?.user?.idstr) {
        // 27004 - mobile only
        postUrlMap[p.idstr] = `https://m.weibo.cn/status/${p.idstr}`;
        return;
      }
      postUrlMap[p.idstr] = `https://www.weibo.com/${p.user.idstr}/${p.idstr}`;
    });
    postUrlMapLength = Object.keys(postUrlMap).length;
    process.stdout.write(`main | [${postUrlMapLength}] post(s) scraped\r`);
    // next
    scrapeOption.maxPostCount > 0 && postUrlMapLength >= scrapeOption.maxPostCount && finishCallback();
    if (responseTimer) {
      clearTimeout(responseTimer);
    }
    responseTimer = setTimeout(finishCallback, scrapeOption.maxFetchIntervalMs);
  });
  //
  // go to feed page
  //
  if (responseTimer) {
    clearTimeout(responseTimer);
  }
  responseTimer = setTimeout(finishCallback, scrapeOption.maxFetchIntervalMs);
  //
  await page.goto(scrapeOption.feedUrl, { waitUntil: 'networkidle2', timeout: 60000 });
  console.log(`main | page [${scrapeOption.feedUrl}] loaded for user [${userId}]`);
  //
  // [BEGIN] start scroll on feed page
  //
  page.evaluate(async (_scrapeOption) => {
    // [SCROLL] trigger page event 'response'
    window._random = (center, offset) => {
      return Math.floor(Math.random() * (2 * offset + 1)) + (center - offset);
    };
    window._scrollTimer = null;
    const _scroll = () => {
      window.scrollBy(0, window._random(_scrapeOption.scrollPixel, _scrapeOption.scrollPixelOffset));
      window._scrollTimer && clearTimeout(window._scrollTimer);
      window._scrollTimer = setTimeout(_scroll, window._random(_scrapeOption.scrollIntervalMs, _scrapeOption.scrollIntervalMsOffset));
    };
    window._scrollTimer = setTimeout(_scroll, window._random(_scrapeOption.scrollIntervalMs, _scrapeOption.scrollIntervalMsOffset));
  }, scrapeOption);
};

main();
