const curry = require("just-curry-it");
const contentTypeParser = require("content-type");
const resolveUrl = require("url-resolve-browser");
const http = require("./fetch");
const { uriReference, isObject } = require("./common");


const construct = (url, status, headers, body) => Object.freeze({ url, status, headers, body });
const extend = (doc, extras) => Object.freeze({ ...doc, ...extras });

const nil = construct("", 0, {}, undefined);
const source = (doc) => doc.body;
const value = (doc) => contentTypeHandler(doc).value(doc);

const fetch = curry((url, options = {}) => {
  const resultDoc = get(url, nil, options);
  return wrapper(resultDoc, options);
});

const get = curry(async (url, contextDoc, options = {}) => {
  const doc = await contextDoc;
  const resolvedUrl = resolveUrl(doc.url, url);

  let result;
  if (uriReference(doc.url) === uriReference(resolvedUrl)) {
    result = extend(doc, { url: resolvedUrl });
  } else if (doc.embedded && uriReference(resolvedUrl) in doc.embedded) {
    const headers = { "content-type": doc.headers["content-type"] };
    result = construct(resolvedUrl, 0, headers, doc.embedded[resolvedUrl]);
  } else {
    result = await jump(resolvedUrl, options);
  }

  return contentTypeHandler(result).get(result, options);
});

const assign = curry(async (newValue, doc) => {
  const subject = await doc;
  return contentTypeHandler(subject).set(newValue, subject);
});

const save = async (doc, options = {}) => {
  const subject = await doc;
  const newBody = contentTypeHandler(subject).stringify(subject);
  const result = await jump(subject.url, {
    method: "PUT",
    headers: {
      ...options.headers,
      "Content-Type": subject.headers["content-type"]
    },
    body: newBody
  });

  const contextDoc = extend(result, { body: newBody });
  return contentTypeHandler(contextDoc).get(contextDoc, options);
};

const jump = async (url, options) => {
  const response = await http(url, options);
  const headers = {};
  for (const [name, value] of response.headers.entries()) {
    headers[name] = value;
  }
  const result = construct(url, response.status, headers, await response.text());

  if (response.status >= 400) {
    const errorResult = get("#", result, options);
    throw contentTypeHandler(errorResult).get(errorResult, options);
  } else {
    return result;
  }
};

const wrapper = (doc, options = {}) => {
  let targetDoc = doc.catch((error) => {
    throw wrapper(Promise.resolve(error), options);
  });

  return new Proxy(Promise.resolve(), {
    get: (_, propertyName) => {
      if (["then", "catch", "always"].includes(propertyName)) {
        const result = project(targetDoc, options);
        return result[propertyName].bind(result);
      } else if (propertyName === "$follow") {
        return (url) => {
          const nextDoc = get(url, targetDoc, options);
          return wrapper(nextDoc, options);
        };
      } else if (propertyName === "$source") {
        return targetDoc.then(value);
      } else if (propertyName === "$url") {
        return targetDoc.then((doc) => doc.url);
      } else if (propertyName === "$assign") {
        return (newValue) => {
          const result = assign(newValue, targetDoc, options);
          const saved = save(result, options);
          return wrapper(saved, options);
        };
      } else {
        const result = safeStep(propertyName, targetDoc, options);
        return wrapper(result, options);
      }
    }
  });
};

const project = async (doc, options = {}) => {
  const docValue = value(await doc);

  if (isObject(docValue)) {
    return Object.keys(docValue).reduce((acc, key) => {
      const resultDoc = step(key, doc, options);
      acc[key] = wrapper(resultDoc, options);
      return acc;
    }, {});
  } else if (Array.isArray(docValue)) {
    return Object.keys(docValue).map((key) => {
      const resultDoc = step(key, doc, options);
      return wrapper(resultDoc, options);
    });
  } else {
    return docValue;
  }
};

const safeStep = async (propertyName, doc, options = {}) => {
  const docValue = value(await doc);
  const keys = Object.keys(docValue);
  return keys.includes(propertyName) ? step(propertyName, doc, options) : undefined;
};

const step = curry(async (key, doc, options = {}) => {
  return contentTypeHandler(await doc).step(key, await doc, options);
});

const contentTypes = {};

const defaultHandler = {
  get: (doc) => doc,
  set: (newValue, doc) => extend(doc, { body: newValue }),
  value: (doc) => isDocument(doc) ? source(doc) : doc,
  stringify: (doc) => doc.body,
  step: (key, doc) => value(doc)[key]
};

const addContentType = (contentType, handler) => contentTypes[contentType] = handler;
const getContentType = (contentType) => contentTypes[contentType];

const contentTypeHandler = (doc) => {
  if (doc === nil || !isDocument(doc)) {
    return defaultHandler;
  }

  const contentType = "content-type" in doc.headers
    ? contentTypeParser.parse(doc.headers["content-type"]).type
    : "";
  return contentType in contentTypes ? contentTypes[contentType] : defaultHandler;
};

const isDocument = (value) => isObject(value) && "url" in value;

module.exports = {
  construct, extend, addContentType, getContentType,
  nil, get, fetch, assign, source, value, step
};