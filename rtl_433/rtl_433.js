module.exports = function(RED) {
  
  var spawn = require("child_process").spawn;
  // var child = spawn("rtl_433 -F json");

  // https://stackoverflow.com/a/20392392
  function tryParseJSON (jsonString){
    try {
        var o = JSON.parse(jsonString);

        // Handle non-exception-throwing cases:
        // Neither JSON.parse(false) or JSON.parse(1234) throw errors, hence the type-checking,
        // but... JSON.parse(null) returns null, and typeof null === "object",
        // so we must check for that, too. Thankfully, null is falsey, so this suffices:
        if (o && typeof o === "object") {
            return o;
        }
    }
    catch (e) { }

    return false;
  };

  function Rtl433Node(config) {
    RED.nodes.createNode(this,config);
    this.running = false;
    this.cmd = "rtl_433";
    this.args = ["-F","json"];
    if(config.frequency){
      this.args.push("-f", config.frequency)
    }
    this.op = "lines"
    this.autorun = true;
    var node = this;
    var lastmsg = {};

    function runRtl433() {
      var line = "";
      // node.status({fill:"grey", shape:"ring", text:"no command rtl_433"});
      // node.log("runRtl433(): launched");
      try {
        node.child = spawn(node.cmd, node.args);
        if (RED.settings.verbose) { node.log(node.cmd+" "+JSON.stringify(node.args)); }
        node.status({fill:"green",shape:"dot",text:"listening"});
        node.running = true;
        node.log("runRtl433(): node.running = true");

        node.child.stdout.on("data", function (data) {
          // node.log("runRtl433(): node.child.stdout data: "+data);  // debug only
          // only send lines that are parsable JSON data
          if (RED.settings.verbose) { node.log("out: "+data); }
          line += data.toString();
          var bits = line.split("\n");
          // node.log("rtl_433: bits.length = " + bits.length);
          while (bits.length > 1) {
            var b = bits.shift();
            // node.log(b); // debugging only
            o = tryParseJSON( b );
            if (o) {
              if ( JSON.stringify(lastmsg.payload) === JSON.stringify(o) ) {
                lastmsg.payload = o
                // node.log("rtl_433: skipped dup message: " + JSON.stringify(o));
              } else {
                lastmsg.payload = o
                // node.log("rtl_433: send message:        " + JSON.stringify(o));
                node.send([lastmsg,null,null]);
              }
            } else {
              // not JSON
              node.log("rtl_433 STDOUT: "+o);
            }
          }
          line = bits[0];
        });
        
        node.child.stderr.on("data", function (data) {
          node.log("rtl_433 STDERR:  "+data);
        });
       
        node.child.on('close', function (code,signal) {
          if (RED.settings.verbose) { node.log("rtl_433 ret: "+code+":"+signal); }
          node.running = false;
          node.child = null;
          var rc = code;
          if (code === null ) { rc = signal; }
          node.send([null,null,{payload:rc}]);
          node.status({fill:"red",shape:"ring",text:"stopped"});
        });
        
        node.child.on('error', function(err) {
          if (err.errno === "ENOENT") { node.warn('Command not found'); }
          else if (err.errno === "EACCES") { node.warn('Command not executable'); }
          else { node.log('error: ' + err); }
          node.status({fill:"red",shape:"ring",text:"error"});
        });
      }
      catch(e) {
        if (e.errno === "ENOENT" ) { node.warn("Command not found: "+node.cmd); } 
        else if (e.errno === "EACCES") { node.warn("Command not executable: "+node.cmd); } 
        else { 
          node.log("error: " + e); 
          node.debug("rtl_433 error: "+e);
        }
        node.status({fill:"red",shape:"ring",text:"error"});
        node.running = false;
      }
    }

    if (node.redo === true) {
      var loop = setInterval( function() {
        if (!node.running) {
          node.warn("Restarting : " + node.cmd);
          runit();
        }
      }, 10000);  // Restart after 10 secs if required
    }

    node.on("close", function(done) {
      clearInterval(loop);
      if(node.child != null) {
        var tout;
        node.child.on("exit",function() {
          if (tout) {clearTimeout(tout); }
          done();
        });
        tout = setTimeout(function() {
          node.child.kill("SIGKILL"); // if it takes more than 3 sec kill it anyway
          done();
        }, 3000);
        node.child.kill(node.closer);
        if (RED.settings.verbose) { node.log(node.cmd+" stopped"); }
      } else { setTimeout(function() { done(); }, 100); }
      node.status({});
    });
    
    if(this.autorun) { runRtl433(); }

    //node.on("input", function(msg) {
    //  node.send(msg);
    //});
  }
  RED.nodes.registerType("rtl_433",Rtl433Node);
}
