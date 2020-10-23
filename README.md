# testwebrtc
signaling_server with client code

websocket server will require ssl key and certificate file
which can be generated from openSSL utility

# install openSSL utitlity 
  ### in case of linux you can download & install 
  from https://www.openssl.org/source/ 
  OR
  from terminal
  $ sudo apt-get install openssl openssl-devel

  ### in case of windows you can download & install binaries from https://slproweb.com/products/Win32OpenSSL.html

  # generate Generate a Self-Signed Certificate
  go to the path where you want to keep your ssl key and certificate and run following command with userdefined file name at "filename"
  
  $ openssl req -newkey rsa:2048 -nodes -keyout filename.key-x509 -days 365 -out filename.crt

  and assign the path of .key file to keyFilePath variable and .cert file to certFilePath variable in wserver.js
