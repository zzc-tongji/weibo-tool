import * as fs from 'node:fs';
import * as path from 'node:path';
//
import { ArgumentParser } from 'argparse';

const parser = new ArgumentParser({
  description: 'Weibo Summary',
});
parser.add_argument('--liked', '-l', { help: 'Weibo note(s) liked (点赞), generated from "scrape.js"', default: './data.weibo.fav.json' });
parser.add_argument('--collection', '-c', { help: 'Weibo note(s) collection (收藏), generated from "scrape.js"', default: './data.weibo.liked.json' });
parser.add_argument('--eagle', '-e', { help: 'stored Weibo note(s) in Eagle, generated as "url-list.weibo.com.txt" from "media-to-eagle/tool/get-url-list.js"', default: '' });
parser.add_argument('--wkdir', '-w', { help: 'working directory', required: true });
const argv = parser.parse_args();
//
const liked = JSON.parse(fs.readFileSync(path.isAbsolute(argv.liked) ? argv.liked : path.resolve(argv.wkdir, argv.liked), { encoding: 'utf-8' }));
const collection = JSON.parse(fs.readFileSync(path.isAbsolute(argv.collection) ? argv.collection : path.resolve(argv.wkdir, argv.collection), { encoding: 'utf-8' }));
let eagle = {};
if (argv.eagle) {
  fs.readFileSync(path.resolve(argv.wkdir, argv.eagle), { encoding: 'utf-8' }).split('\n').map((url) => {
    const test = /^https:\/\/www.xiaohongshu.com\/explore\/(.*)$/.exec(url);
    test && (eagle[test[1]] = url);
  });
}
//
const summary = {};
Object.keys(liked).map((key) => {
  if (!summary[key]) {
    summary[key] = {};
  }
  summary[key].url = liked[key];
  summary[key].liked = true;
});
Object.keys(collection).map((key) => {
  if (!summary[key]) {
    summary[key] = {};
  }
  summary[key].url = collection[key];
  summary[key].collection = true;
});
Object.keys(eagle).map((key) => {
  if (!summary[key]) {
    summary[key] = {};
  }
  (!summary[key].url) && (summary[key].url = eagle[key]);
  summary[key].eagle = true;
});
fs.writeFileSync(path.resolve(argv.wkdir, 'summary.weibo.json'), JSON.stringify(summary, null, 2), { encoding: 'utf-8' });
//
const summaryCsv = 'ID,URL,Liked,Collection,Eagle\n' + Object.keys(summary).map(key => `${key},${summary[key].url},${summary[key].liked || false},${summary[key].collection || false},${summary[key].eagle || false}`).join('\n');
fs.writeFileSync(path.resolve(argv.wkdir, 'summary.weibo.csv'), summaryCsv, { encoding: 'utf-8' });
//
const likedButNotCollection = Object.values(summary).filter(v => v.liked && !v.collection).map(v => v.url).join('\n');
fs.writeFileSync(path.resolve(argv.wkdir, 'summary.weibo.liked-but-not-collected.txt'), likedButNotCollection, { encoding: 'utf-8' });
const collectionButNotLiked = Object.values(summary).filter(v => !v.liked && v.collection).map(v => v.url).join('\n');
fs.writeFileSync(path.resolve(argv.wkdir, 'summary.weibo.collected-but-not-liked.txt'), collectionButNotLiked, { encoding: 'utf-8' });
//
console.log('done');
