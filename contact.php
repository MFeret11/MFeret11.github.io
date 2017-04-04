<?php
    $name = $_POST['Name'];
    $email = $_POST['Email'];
    $note = $_POST['note'];
    $from = 'From: TangledDemo';
    $to = 'mferet11@gmail.com';
   $subject = 'Hello';

   $body = "From: $name\n E-Mail: $email\n Message:\n $note";

   if ($_POST['submit']) {
    /* Anything that goes in here is only performed if the form is submitted */
      if (mail ($to, $subject, $body, $from)) {
       echo '<p>Your message has been sent!</p>';
     } else {
       echo '<p>Something went wrong, go back and try again!</p>';
     }
   }
?>
