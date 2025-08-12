import * as process from 'node:process';
//
import check from 'check-types';

const random = (center, offset) => {
  return Math.floor(Math.random() * (2 * offset + 1)) + (center - offset);
};

const sleep = (ms) => {
  if (!check.number(ms) || ms <= 0) {
    throw new Error('sleep | invalid parameter');
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const waitForUserLogin = async ({ page, pollingTimeMs }) => {
  if (!page || !check.object(page)) {
    throw new Error('waitForUserLogin | parameter `page` required');
  }
  if (!check.number(pollingTimeMs) || pollingTimeMs < 10000) {
    pollingTimeMs = 10000;
  }
  const re = /weibo.com\/u\/(.*)$/;
  let userPageUrl = null;
  while (!(userPageUrl = await page.$$('.woo-tab-nav a').then(ehl => Promise.all(ehl.map((eh) => page.evaluate(e => e.href, eh)))).then(ul => ul.find(u => re.test(u))))) {
    process.stdout.write(`waitForUserLogin | non-login | please login at browser window | polling after [${pollingTimeMs / 1000}] second(s)\r`);
    await sleep(pollingTimeMs);
  }
  const userId = re.exec(userPageUrl)[1];
  console.log(`waitForUserLogin | login as user [${userId}]                                 `);
  const cookieParam = (await page.cookies()).filter((c) => c.domain.endsWith('weibo.com') || c.domain.endsWith('sina.com.cn'));
  return { userId, cookieParam, cookieHeader: cookieParam.map((c) => `${c.name}=${c.value}`).join('; ') };
};

export { random, sleep, waitForUserLogin };
