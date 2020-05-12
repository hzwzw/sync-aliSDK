var util = require('../topUtil.js');
var RestClient = require('./network.js')
/**
 * TOP API Client.
 *
 * @param {Object} options, must set `appkey` and `appsecret`.
 * @constructor
 */

function LinkClient(options) {
  if (!(this instanceof LinkClient)) {
    return new LinkClient(options);
  }
  options = options || {};
  this.url = options.url || 'http://link.cainiao.com/gateway/link.do';
  this.appsecret = options.appsecret;
  this.logistic_provider_id = options.logistic_provider_id;
}

/**
 * Invoke an api by method name.
 *
 * @param {String} method, method name
 * @param {Object} params
 * @param {Array} reponseNames, e.g. ['tmall_selected_items_search_response', 'tem_list', 'selected_item']
 * @param {Object} defaultResponse
 * @param {Function(err, response)} callback
 */
LinkClient.prototype.invoke = function (type, method, params, reponseNames, callback) {
  const cb = (err, result) => {
    if (err) {
      return callback(err);
    }
    var response = result;
    if (reponseNames && reponseNames.length > 0) {
      var retResult = undefined;
      for (var i = 0; i < reponseNames.length; i++) {
        var name = reponseNames[i];
        retResult = response[name];
        if (retResult != undefined) {
          response = retResult;
          break;
        }
      }
    }
    callback(null, response);
  }
  return this.request(type, method, params, cb);
};

/**
 * Request API.
 *
 * @param {Object} params
 * @param {String} method
 * @param {String} [type='GET']
 * @param {Function(err, result)} callback
 * @public
 */
LinkClient.prototype.request = function (type, method, params, callback) {

  const json_params = JSON.stringify(params);

  const args = {
    "msg_type": method,
    "logistic_provider_id": this.logistic_provider_id,
    "data_digest": this.sign(json_params),
    "logistics_interface": json_params
  }

  let request = null;
  if(type === 'get'){
    request = RestClient.get(this.url);
  }else{
    request = RestClient.post(this.url);
  }

  for(let key in args){
    request.field(key, args[key]);
  }

  request.end(function(response){
    if(response.statusCode === 200 || response.statusCode === 201){
      const data = JSON.parse(response.body);
      const errRes = data && data.success;
      if (errRes === 'false') {
        const err = new Error(data.errorMsg || 'xxx');
        callback(err, data);
      }else{
        callback(null, data);
      }
    }else{
      const err = new Error('NetWork-Error');
      err.name = 'NetWork-Error';
      err.code = 15;
      err.sub_code = response.statusCode;
      callback(err, null);
    }
  })
};

/**
 * Sign API request.
 * see http://open.taobao.com/doc/detail.htm?id=111#s6
 *
 * @param  {Object} params
 * @return {String} sign string
 */
LinkClient.prototype.sign = function (str) {
  const basestring = str + this.appsecret;
  const ok = Buffer.from(basestring, 'utf-8');
  return util.hash('md5', ok, 'base64');
};

/**
 * execute top api
 */
LinkClient.prototype.execute = function (apiname, params) {
  let that = this;
  return new Promise(function (resolve, reject) {
    that.invoke('post',apiname, params, [util.getApiResponseName(apiname)], (err, response) => {
      if (err) {
        return reject(err);
      }
      resolve(response);
    });
  })
};

exports.LinkClient = LinkClient;
