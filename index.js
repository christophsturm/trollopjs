// lib/trollop.rb -- trollop command-line processing library
// Author::    William Morgan (mailto: wmorgan-trollop@masanjin.net)
// Copyright:: Copyright 2007 William Morgan
// License::   GNU GPL version 2

var util = require('util');
var underscore = require('./dependencies/underscore')['_'];

const VERSION = "1.15";

// Thrown by Parser in the event of a commandline error. Not needed if
// you're using the Trollop:'options' entry.
var CommandLineError = new Error('Command line error');

// Thrown by Parser if the user passes in '-h' or '--help'. Handled
// automatically by Trollop#options.
var HelpNeeded = new Error('Help Needed');

// Thrown by Parser if the user passes in '-v' or '--version'. Handled
// automatically by Trollop#options.
var VersionNeeded = new Error('Version needed');


// Regex for floating point numbers
const FLOAT_RE = /^-?((\d+(\.\d+)?)|(\.\d+))$/;

// Regex for parameters
const PARAM_RE = /^-(-|\.$|[^\d\.])/;

// The set of values that indicate a flag option when passed as the
// +'type'+ parameter of #opt.
const FLAG_TYPES = ['flag', 'bool', 'boolean'];

// The set of values that indicate a single-parameter (normal) option when
// passed as the +'type'+ parameter of #opt.
//
// A value of +io+ corresponds to a readable IO resource, including
// a filename, URI, or the strings 'stdin' or '-'.
const SINGLE_ARG_TYPES = ['int', 'integer', 'string', 'double', 'float', 'date'];

// The set of values that indicate a multiple-parameter option (i.e., that
// takes multiple space-separated values on the commandline) when passed as
// the +'type'+ parameter of #opt.
const MULTI_ARG_TYPES = ['ints', 'integers', 'strings', 'doubles', 'floats', 'dates'];

// The complete set of legal values for the +'type'+ parameter of #opt.
const TYPES = [].concat(FLAG_TYPES, SINGLE_ARG_TYPES, MULTI_ARG_TYPES);

const INVALID_SHORT_ARG_REGEX = /[\d-]/

// The commandline parser. In typical usage, the methods in this class
// will be handled internally by Trollop:'options'. In this case, only the
// #opt, #banner and #version, #depends, and #conflicts methods will
// typically be called.
//
// If it's necessary to instantiate this class (for more complicated
// argument-parsing situations), be sure to call #parse to actually
// produce the output hash.
var Parser = exports.Parser = function() {
  this._version = null;
  this.leftovers = [];
  this.specs = {};
  this.long = {};
  this.short = {};
  this.order = [];
  this.constraints = [];
  this.stop_words = [];
  this._stop_on_unknown = false;

  if( arguments.length > 0 && arguments[0].length > 0 ) {
    var args =  arguments[0];
    var func = args.pop();
    func.apply(this,args);
  }
};

// Define an option. +name+ is the option name, a unique identifier
// for the option that you will use internally, which should be a
// symbol or a string. +desc+ is a string description which will be
// displayed in help messages.
//
// Takes the following optional arguments:
//
// [+:long+] Specify the long form of the argument, i.e. the form with two dashes. If unspecified, will be automatically derived based on the argument name by turning the +name+ option into a string, and replacing any _'s by -'s.
// [+:short+] Specify the short form of the argument, i.e. the form with one dash. If unspecified, will be automatically derived from +name+.
// [+:type+] Require that the argument take a parameter or parameters of type +type+. For a single parameter, the value can be a member of +SINGLE_ARG_TYPES+, or a corresponding Ruby class (e.g. +Integer+ for +:int+). For multiple-argument parameters, the value can be any member of +MULTI_ARG_TYPES+ constant. If unset, the default argument type is +:flag+, meaning that the argument does not take a parameter. The specification of +:type+ is not necessary if a +:default+ is given.
// [+:default+] Set the default value for an argument. Without a default value, the hash returned by #parse (and thus Trollop::options) will have a +nil+ value for this key unless the argument is given on the commandline. The argument type is derived automatically from the class of the default value given, so specifying a +:type+ is not necessary if a +:default+ is given. (But see below for an important caveat when +:multi+: is specified too.) If the argument is a flag, and the default is set to +true+, then if it is specified on the the commandline the value will be +false+.
// [+:required+] If set to +true+, the argument must be provided on the commandline.
// [+:multi+] If set to +true+, allows multiple occurrences of the option on the commandline. Otherwise, only a single instance of the option is allowed. (Note that this is different from taking multiple parameters. See below.)
//
// Note that there are two types of argument multiplicity: an argument
// can take multiple values, e.g. "--arg 1 2 3". An argument can also
// be allowed to occur multiple times, e.g. "--arg 1 --arg 2".
//
// Arguments that take multiple values should have a +:type+ parameter
// drawn from +MULTI_ARG_TYPES+ (e.g. +:strings+), or a +:default:+
// value of an array of the correct type (e.g. [String]). The
// value of this argument will be an array of the parameters on the
// commandline.
//
// Arguments that can occur multiple times should be marked with
// +:multi+ => +true+. The value of this argument will also be an array.
// In contrast with regular non-multi options, if not specified on
// the commandline, the default value will be [], not nil.
//
// These two attributes can be combined (e.g. +:type+ => +:strings+,
// +:multi+ => +true+), in which case the value of the argument will be
// an array of arrays.
//
// There's one ambiguous case to be aware of: when +:multi+: is true and a
// +:default+ is set to an array (of something), it's ambiguous whether this
// is a multi-value argument as well as a multi-occurrence argument.
// In thise case, Trollop assumes that it's not a multi-value argument.
// If you want a multi-value, multi-occurrence argument with a default
// value, you must specify +:type+ as well.
Parser.prototype.opt = function(name, _desc, _opts) {
  if( typeof _desc == 'undefined' ) {
    var desc = "";
  }
  else {
    var desc = _desc;
  }

  if( typeof _opts == 'undefined' ) {
    var opts = {};
  }
  else {
    var opts = _opts;
  }

  if( name in this.specs ) {
    throw "You already have an argument named '" + name + "'";
  }

  // fill in :type
  if( 'type' in opts ) {
    if( opts.type.constructor == String )
    {
      switch(opts.type) {
      case 'boolean':
      case 'bool':
        opts.type = 'flag'
        break;
      case 'integer':
        opts.type = 'int'
        break;
      case 'integers':
        opts.type = 'ints';
        break;
      case 'double':
        opts.type = 'float';
        break;
      case 'doubles':
        opts.type = 'floats';
        break;
      default:
        if(!underscore.include(TYPES, opts.type)) {
          throw "unsupported argument type '"+opts.type+"'";
        }
      }
    }
    else if(opts.type == String) {
      opts.type = "string";
    }
    else if(opts.type == Number) {
      opts.type = "float";
    }
    else if(opts.type == Boolean) {
      opts.type = "flag";
    }
    else if(opts.type == Date) {
      opts.type = "date";
    }
    else {
      throw "unsupported argument type '"+opts.type+"'";
    }
  }
  else {
    opts.type = null;
  }

  // for options with :multi => true, an array default doesn't imply
  // a multi-valued argument. for that you have to specify a :type
  // as well. (this is how we disambiguate an ambiguous situation;
  // see the docs for Parser#opt for details.)
  if( opts.multi && opts.dflt && opts.dflt.constructor == Array && !opts.type) {
    var disambiguated_default = opts.dflt[0];
  }
  else {
    var disambiguated_default = opts.dflt;
  }

  if( typeof disambiguated_default == 'undefined' || disambiguated_default === null  ) {
    var type_from_default = null;
  }
  else if( disambiguated_default.constructor == Number ) {
    if( (disambiguated_default+'').match(/^[0-9]+$/) ) {
      var type_from_default = 'int';
    }
    else {
      var type_from_default = 'float';
    }
  }
  else if( disambiguated_default.constructor == Boolean ) {
    var type_from_default = 'flag';
  }
  else if( disambiguated_default.constructor == String ) {
    var type_from_default = 'string';
  }
  else if( disambiguated_default.constructor == Date ) {
    var type_from_default = 'date';
  }
  else if( disambiguated_default.constructor == Array ) {
    if( opts.dflt.length < 1 ) {
      throw "multiple argument type cannot be deduced from an empty Array";
    }

    if( opts.dflt[0] && opts.dflt[0].constructor == Number ) {
      if( (opts.dflt[0]+'').match(/^[0-9]+$/) ) {
        var type_from_default = 'ints';
      }
      else {
        var type_from_default = 'floats';
      }
    }
    else if( opts.dflt[0].constructor == String ) {
      var type_from_default = 'strings';
    }
    else if( opts.dflt[0].constructor == Date ) {
      var type_from_default = 'dates';
    }
    else {
      throw "unsupported multiple argument type";
    }
  }
  else {
    throw "unsupported argument type";
  }

  if(opts.type && type_from_default && opts.type != type_from_default) {
    throw "type specification and default type don't match (default type is "+type_from_default+")";
  }

  opts.type = opts.type || type_from_default || 'flag';

  if( !opts.type ) {
    opts.type = 'flag';
  }

  // fill in :long
  opts.long = !(typeof opts.long == 'undefined' || opts.long === null) ? (opts.long+'') : (name+'').replace(/_/g, '-');
  if( m = opts.long.match(/^--([^-].*)$/) ) {
    opts.long = m[1];
  }
  else if( opts.long.match(/^[^-]/) ) {
    opts.long = opts.long;
  }
  else {
    throw "invalid long option name " + opts.long;
  }

  if(opts.long in this.long) {
    throw "long option name "+opts.long+" is already taken; please specify a (different) long";
  }

  // fill in :short
  if( typeof opts.short == 'undefined' || opts.short === null || opts.short == 'none' || opts.short.match(/^.$/) ) {
    opts.short = opts.short;
  }
  else if( m = opts.short.match(/^-(.)$/) ) {
    opts.short = m[1];
  }
  else {
    throw "invalid short option name '" + opts.short + "'";
  }

  if(opts.short) {
    if(this.short[opts.short]) {
      throw "short option name " + opts.short +" is already taken; please specify a (different) short";
    }
    if(opts.short.match(INVALID_SHORT_ARG_REGEX)) {
      throw "a short option name can't be a number or a dash";
    }
  }

  // fill in :default for flags
  if( opts.type == 'flag' && !opts.dflt ) {
    opts.dflt = false;
  }

  // autobox :default for :multi (multi-occurrence) arguments
  if(opts.dflt && opts.multi && opts.dflt.constructor != Array) {
    opts.dflt = [opts.dflt];
  }

  // fill in :multi
  opts.multi = opts.multi || false;

  opts.desc = opts.desc || desc;
  this.long[opts.long] = name
  if(opts.short && opts.short != 'none') {
    this.short[opts.short] = name
  }
  this.specs[name] = opts;
  this.order.push(['opt', name]);
};

// Sets the version string. If set, the user can request the version
// on the commandline. Should probably be of the form "<program name>
// <version number>".
Parser.prototype.version = function(s) {
  if( s ) {
    this._version = s;
  }
  else {
    this._version = null;
  }

  return this._version;
};

// Adds text to the help display. Can be interspersed with calls to
// #opt to build a multi-section help page.
Parser.prototype.banner = function(s) {
  this.order.push(['text', s]);
};
Parser.prototype.text = Parser.prototype.banner;

// Marks two (or more!) options as requiring each other. Only handles
// undirected (i.e., mutual) dependencies. Directed dependencies are
// better modeled with Trollop::die.
Parser.prototype.depends = function() {
  var syms = Array.prototype.slice.call(arguments);
  syms.forEach(function(sym) {
      if( !this.specs[sym] ) {
        throw "unknown option '"+sym+"'";
      }
    },this);
  this.constraints.push(['depends', syms]);
};

// Marks two (or more!) options as conflicting.
Parser.prototype.conflicts = function() {
  var syms = Array.prototype.slice.call(arguments);
  syms.forEach(function(sym) {
      if( !this.specs[sym] ) {
        throw "unknown option '"+sym+"'";
      }
    },this);
  this.constraints.push(['conflicts', syms]);
};

// Defines a set of words which cause parsing to terminate when
// encountered, such that any options to the left of the word are
// parsed as usual, and options to the right of the word are left
// intact.
//
// A typical use case would be for subcommand support, where these
// would be set to the list of subcommands. A subsequent Trollop
// invocation would then be used to parse subcommand options, after
// shifting the subcommand off of ARGV.
Parser.prototype.stop_on = function() {
  this.stop_words = underscore.flatten(Array.prototype.slice.call(arguments));
};

// Similar to #stop_on, but stops on any unknown word when encountered
// (unless it is a parameter for an argument). This is useful for
// cases where you don't know the set of subcommands ahead of time,
// i.e., without first parsing the global options.
Parser.prototype.stop_on_unknown = function() {
  this._stop_on_unknown = true;
};

// Parses the commandline. Typically called by Trollop::options.
Parser.prototype.parse = function(_cmdline) {
  if( typeof _cmdline == 'undefined' ) {
    var cmdline = process.ARGV;
  }
  else {
    var cmdline = _cmdline;
  }
  var vals = {}
  var required = {}

  if(this._version && !(this.specs['version'] || this.long['version']) ) {
    this.opt('version', "Print version and exit");
  }
  if(!this.specs['help'] && !this.long['help']) {
    this.opt('help', "Show this message");
  }

  for(var sym in this.specs) {
    var opts = this.specs[sym];
    if(opts.required) {
      required[sym] = true;
    }
    vals[sym] = opts.dflt;
    if(opts.multi && !opts.dflt) { // multi arguments default to [], not nil
      vals[sym] = [];
    }
  }

  this._resolve_default_short_options();

  // resolve symbols
  var given_args = {};
  this.leftovers = this._each_arg(cmdline, function(arg, params) {
    if( m = arg.match(/^-([^-])$/) ) {
      var sym = this.short[m[1]];
    }
    else if( m = arg.match(/^--([^-]\S*)$/) ) {
      var sym = this.long[m[1]];
    }
    else {
      throw "invalid argument syntax: '" + arg + "'";
    }

    if( typeof sym == 'undefined' ) {
      throw "unknown argument '" + arg + "'";
    }

    if(sym in given_args && !this.specs[sym].multi) {
      throw "option '" + arg + "' specified multiple times";
    }

    given_args[sym] = given_args[sym] || {};

    given_args[sym].arg = arg
    given_args[sym].params = given_args[sym].params || [];

    // The block returns the number of parameters taken.
    var num_params_taken = 0

    if(params) {
      if( underscore.include(SINGLE_ARG_TYPES, this.specs[sym].type) ) {
        given_args[sym].params.push([params.shift()]); // take the first parameter
        num_params_taken = 1;
      }
      else if( underscore.include(MULTI_ARG_TYPES, this.specs[sym].type) ) {
        given_args[sym].params.push(params) // take all the parameters
        num_params_taken = params.length;
      }
    }

    return num_params_taken;
  });

  // check for version and help args
  if('version' in given_args) {
    throw VersionNeeded;
  }
  if('help' in given_args) {
    throw HelpNeeded;
  }

  // check constraint satisfaction
  this.constraints.forEach(function(tuple) {
    var type = tuple[0];
    var syms = tuple[1];

    constraint_sym = underscore.detect(syms, function(sym) { return given_args[sym] } );
    if(!constraint_sym) {
      return;
    }

    switch(type) {
    case 'depends':
      syms.forEach( function(sym) {
          if( !(sym in given_args) ) {
            throw "--" + this.specs[constraint_sym].long +" requires --"+ this.specs[sym].long;
          }
        },this);
      break;
    case 'conflicts':
      syms.forEach( function(sym) {
          if( sym in given_args && (sym != constraint_sym) ) {
            throw "--" + this.specs[constraint_sym].long +" conflicts with --"+ this.specs[sym].long;
          }
        },this);
      break;
    }
  },this);

  for( var sym in required) {
    var val = required[sym];
    if( !(sym in given_args) ) {
      throw "option '" + sym + "' must be specified";
    }
  }

  // parse parameters
  for( var sym in given_args ) {
    var given_data = given_args[sym];
    var arg = given_data.arg;
    var params = given_data.params;

    opts = this.specs[sym]
    if(params.length < 1 && opts.type != 'flag') {
      throw "option '"+arg+"' needs a parameter";
    }

    vals[sym+'_given'] = true; // mark argument as specified on the commandline

    var selfScoper = this;
    switch( opts.type) {
    case 'flag':
      vals[sym] = !opts.dflt;
      break;
    case 'int':
    case 'ints':
      vals[sym] = underscore.map(params, function(pg) { return underscore.map(pg, function(p) { return selfScoper._parse_integer_parameter(p, arg); }); });
      break;
    case 'float':
    case 'floats':
      vals[sym] = underscore.map(params, function(pg) { return underscore.map(pg, function(p) { return selfScoper._parse_float_parameter(p, arg); }); });
      break;
    case 'string':
    case 'strings':
      vals[sym] = underscore.map(params, function(pg) { return underscore.map(pg, function(p) { return p+''; }); });
      break;
    case 'date':
    case 'dates':
      vals[sym] = underscore.map(params, function(pg) { return underscore.map(pg, function(p) { return selfScoper._parse_date_parameter(p, arg); }); });
      break;
    }

    if(underscore.include(SINGLE_ARG_TYPES, opts.type) ) {
      if(!opts.multi) { // single parameter
        vals[sym] = vals[sym][0][0];
      }
      else { // multiple options, each with a single parameter
        vals[sym] = underscore.map(vals[sym], function(p) { return p[0]; });
      }
    }
    else if( underscore.include(MULTI_ARG_TYPES, opts.type) && !opts.multi ) {
      vals[sym] = vals[sym][0]  // single option, with multiple parameters
    }
    // else: multiple options, with multiple parameters
  }

  /*
  // allow openstruct-style accessors
  class << vals
    def method_missing(m, *args)
      self[m] || self[m.to_s]
    end
  end
  */
  return vals;
};

// Print the help message to +stream+.
Parser.prototype.educate = function(_stream) {
  //=$stdout
  this.width(); // just calculate it now; otherwise we have to be careful not to
                // call this unless the cursor's at the beginning of a line.

  var left = {}
  for( var name in this.specs ) {
    var spec = this.specs[name];
    left[name] = "--"+spec.long+((spec.short && spec.short != 'none') ? ", -"+spec.short : "");
    switch(spec.type) {
      case 'flag':
        left[name] +=  "";
        break;
      case 'int':
        left[name] +=  " <i>";
        break;
      case 'ints':
        left[name] +=  " <i+>";
        break;
      case 'string':
        left[name] +=  " <s>";
        break;
      case 'strings':
        left[name] +=  " <s+>";
        break;
      case 'float':
        left[name] +=  " <f>";
        break;
      case 'floats':
        left[name] +=  " <f+>";
        break;
      case 'io':
        left[name] +=  " <filename/uri>";
        break;
      case 'ios':
        left[name] +=  " <filename/uri+>";
        break;
      case 'date':
        left[name] +=  " <date>";
        break;
      case 'dates':
        left[name] +=  " <date+>";
        break;
    }
  }

  var leftcol_width = underscore(left).chain().values().pluck('length').max().value();
  var rightcol_start = leftcol_width + 6; // spaces

  if( !(this.order.length > 0 && this.order[0][0] == 'text') ) {
    if(this._version) {
      util.puts(this._version+"\n");
    }
    util.puts("Options:");
  }

  this.order.forEach(function(ordering) {
    var what = ordering[0];
    var opt = ordering[1];

    if(what == 'text') {
      util.puts(this.wrap(opt)+"\n");
      return;
    }

    var spec = this.specs[opt];
    util.print("  " + left[opt]); //TODO: justify this text
    var desc = spec.desc;

    if( !(typeof spec.dflt == 'undefined') && spec.dflt.constructor == Array) {
      var default_s = spec.dflt.join(', ');
    }
    else {
      var default_s = spec.dflt +'';
    }

    if(spec.dflt) {
        if(spec.desc.match(/\.$/)) {
          desc += " (Default: "+default_s+")";
        }
        else {
          desc += " (default: "+default_s+")";
        }
    }

    util.puts(this.wrap(desc, {width: this.width() - rightcol_start - 1, prefix: rightcol_start}));
  },this);
}

Parser.prototype.width = function() {
  return 80;
}

Parser.prototype.wrap = function(str, _opts) {
  if( typeof _opts == 'undefined' ) {
    var opts = {};
  }
  else {
    var opts = _opts;
  }

  if(str == "") {
    var ret = "";
  }
  else {
    var self = this;
    var ret = underscore(str.split("\n")).chain().map(function(s) {
        return self._wrap_line(s, opts);
        }).flatten().value().join("\n");
  }

  return ret;
}

Parser.prototype._wrap_line = function(str, _opts) {
  if( typeof _opts == 'undefined' ) {
    var opts = {};
  }
  else {
    var opts = _opts;
  }

  var prefix = opts.prefix || 0;
  var width = opts.width || (this.width() - 1);
  var start = 0;
  var ret = [];
  while( start <= str.length ) {
    if((start + width) >= str.length) {
      var nextt = str.length;
    }
    else {
      var x = width;
      /*
      x = str.search(/\s[^\s]$/);  //need to come of with an rindex
      if( x && x < start ) {
        x = str.search(/\s/, start)
      }
      */
      var nextt = x || str.length;
    }
    ret.push((ret.length < 1 ? "" : this.padStr(" ",prefix)) + '' + str.substring(start, nextt));
    start = nextt + 1;
  }
  return ret;
};

Parser.prototype.padStr = function(str, num, _padding) {
  if( typeof _padding == 'undefined') {
    var padding = ' ';
  }
  else {
    var padding = _padding;
  }

  var ret = str;
  while(ret.length < num) {
    ret = _padding+ret;
  }

  return ret.substring(0, num);
}


Parser.prototype._parse_integer_parameter = function(param, arg) {
  if( !param.match(/^\d+$/) ) {
    throw "option '"+arg +"' needs an integer";
  }
  return parseInt(param);
};

Parser.prototype._parse_float_parameter = function(param, arg) {
  if(!param.match(FLOAT_RE)) {
    throw "option '"+arg+"' needs a floating-point number";
  }
  return parseFloat(param);
};

Parser.prototype._parse_date_parameter = function(param, arg) {
  var parsed = Date.parse(param);
  if(isNaN(parsed)) {
    throw "option '"+arg+"' needs a date";
  }
  else {
    return  parsed
  }
};

Parser.prototype._resolve_default_short_options = function() {
  this.order.forEach(function(ordering) {
      var type = ordering[0];
      var name = ordering[1];
      if( type != 'opt' ) {
        return;
      }

      var opts = this.specs[name];
      if( opts.short ) {
        return;
      }

      var c = false;
      var copts = opts.long.split('');
      for( var i=0; i < copts.length; i++ ) {
        var d = copts[i];
        if( !d.match(INVALID_SHORT_ARG_REGEX) && !this.short[d] ) {
          c = d;
          break;
        }
      }
      if(c) {
        opts.short = c;
        this.short[c] = name;
      }
    }, this);
};

Parser.prototype._collect_argument_parameters = function(args, start_at) {
  var params = []
  var pos = start_at
  while(args[pos] && !args[pos].match(PARAM_RE) && !underscore.include(this.stop_words, args[pos])) {
    params.push(args[pos]);
    pos++;
  }
  return params;
};

Parser.prototype._each_arg = function(args, callback) {
  var remains = [];
  var i = 0;

  while (i < args.length) {
    if(underscore.include(this.stop_words, args[i])) {
      return remains.concat(args.slice(i));
    }

    if( args[i].match(/^--$/) ) { // arg terminator
      return remains.concat(args.slice((i + 1)));
    }
    else if( m = args[i].match(/^--(\S+?)=(.*)$/) ) { // long argument with equals
      callback.call(this,"--"+m[1], [m[2]]);
      i++;
    }
    else if( args[i].match( /^--(\S+)$/) ) { // long argument
      params = this._collect_argument_parameters(args, i + 1)
      if( params.length > 0 ) {
        var num_params_taken = callback.call(this,args[i], params);
        if(!num_params_taken) {
          if(this._stop_on_unknown) {
            return remains.concat(args.slice(i + 1));
          }
          else {
            remains.concat(params);
          }
        }
        i += 1 + num_params_taken;
      }
      else { // long argument no parameter
        callback.call(this,args[i], null);
        i++;
      }
    }
    else if( m = args[i].match(/^-(\S+)$/) ) { // one or more short arguments
      var shortargs = m[1].split('');
      for( var j = 0; j < shortargs.length; j++ ) {
        var a = shortargs[j];
        if(j == (shortargs.length - 1)) {
          params = this._collect_argument_parameters(args, i + 1)
          if(params.length > 0) {
            var num_params_taken = callback.call(this,"-"+a, params);
            if(!num_params_taken) {
              if(this._stop_on_unknown) {
                return remains.concat(args.slice(i + 1));
              }
              else {
                remains.concat(params);
              }
            }
            i += 1 + num_params_taken;
          }
          else { // argument no parameter
            callback.call(this,"-"+a, null);
            i += 1
          }
        }
        else {
          callback.call(this,"-"+a, null);
        }
      }
    }
    else {
      if(this._stop_on_unknown) {
        return remains.concat(args.slice(i));
      }
      else {
        remains.push(args[i]);
        i++;
      }
    }
  }

  return remains;
};

exports.options = function() {
  var args =  Array.prototype.slice.call(arguments);
  if(args.length > 1) {
    var argv = args.shift();
  }
  else {
    var argv = process.ARGV;
  }
  this.p = new Parser(args);

  try {
    vals = this.p.parse(argv);
    argv.splice(0,argv.length);
    this.p.leftovers.forEach(function(l) {
        argv.push(l);
      });
    return vals;
  }
  catch(err) {
    if( err == HelpNeeded ) {
      this.p.educate();
      process.exit(0);
    }
    else if( err == VersionNeeded ) {
      util.puts(this.p._version);
      process.exit(0);
    }
    else {
      if (err.message) util.puts(err.message);
      if (err.stack) util.puts(err.stack);
    }
    /*
    CommandlineError => e
    $stderr.puts "Error: #{e.message}."
    $stderr.puts "Try --help for help."
    exit(-1)
    */
    return null;
  }
}
