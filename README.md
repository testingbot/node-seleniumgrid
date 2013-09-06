node-seleniumgrid
=================

Selenium Hub/Grid built in nodeJS and used in production on [TestingBot.com](http://testingbot.com).

At TestingBot we've been using this code for 11 months now, running on a single CPU server with the latest version of nodejs.

We built this to replace the Selenium grid functionality that comes with the default Selenium source code in Java.
One of the reasons we used nodeJS was because we wanted it to be easy to read and understand.

With this code, you can run a Selenium grid, point your own Selenium nodes to it and run tests against it.
It also comes with an option to use the TestingBot grid if a specific browser is not present on your grid.
So for example: you have 2 virtual machines with both Linux and Windows but you also want to run tests against Mac.
By using this grid, your tests will run on your own 2 virtual machines and use the TestingBot grid to run the tests on our Mac VMs.

Requirements
------------

General:

* NodeJS, at least v0.10.0
* npm

User Quick Start
------------

* sudo npm -g install node-seleniumgrid
* node-seleniumgrid -k testingbot_key -s testingbot_secret

You now have a local Selenium grid running on port 4444.
Start a Selenium node and point it to this grid, it should register to the grid.
Now run a simple Selenium test against your new grid, depending on the capabilities you requested it should forward the test to your Selenium node.

1. run `node-seleniumgrid`
2. start a node `java -jar selenium-standalone.jar -role node -hub http://my-computer-ip:4444/grid/register`
3. point your test to run on my-computer-ip port 4444:

```ruby
require "rubygems"
require "selenium-webdriver" 
require "selenium/client"

caps = {
  :browserName => "firefox",
  :version => "22",
  :platform => "WINDOWS"
}

urlhub = "http://my-computer-ip:4444/wd/hub"
client = Selenium::WebDriver::Remote::Http::Default.new
client.timeout = 120

@webdriver = Selenium::WebDriver.for :remote, :url => urlhub, :desired_capabilities => caps, :http_client => client
@webdriver.navigate.to "https://www.google.com"
puts @webdriver.title
@webdriver.quit
```

Troubleshooting
------------

If you encounter problems setting this up, please open a ticket in the issues section.

Tests
------------

There are tests included in this project, to run them, please use mocha:
`mocha tests/*.js`

Contributing
------------
Fork the project, make a change, and send a pull request!

License
------------

Licensed under the Apache License, Version 2.0
