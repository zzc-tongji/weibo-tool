let setting = {};

const post = (s) => {
  setting = s;
};

const get = () => {
  return setting;
};

export { get, post };
