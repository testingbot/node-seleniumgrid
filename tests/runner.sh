for f in test/*.js; 
do
mocha $f;
done
