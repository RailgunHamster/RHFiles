package com.railgunhamster.rhfiles

import android.app.Activity
import android.content.Context
import android.text.InputType
import android.widget.*
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk=[34],manifest=Config.NONE)
class NativeAutomationTest {
  private val context:Context get()=RuntimeEnvironment.getApplication()
  @Test fun optInIsDeviceLocalAndAllNativeCommandsAreClosedByDefault(){
    NativeAutomation.setEnabled(context,false)
    assertFalse(NativeAutomation.status(context).getBoolean("enabled"))
    try{NativeAutomation.dispatch(context,"automation.ui.list",JSONObject());fail("native actions must be closed")}catch(e:IllegalStateException){assertTrue(e.message!!.contains("开启"))}
    NativeAutomation.setEnabled(context,true);assertTrue(NativeAutomation.enabled(context))
    assertFalse(context.getSharedPreferences("settings-v1",Context.MODE_PRIVATE).contains("automation"))
    NativeAutomation.setEnabled(context,false);assertFalse(NativeAutomation.enabled(context))
  }
  @Test fun nativeUiUsesTheExistingCallbacksAndDoesNotReadPasswords(){
    val controller=Robolectric.buildActivity(Activity::class.java).setup();val activity=controller.get()
    try{
      NativeAutomation.install(activity);NativeAutomation.setEnabled(context,true)
      val root=LinearLayout(activity).apply{orientation=LinearLayout.VERTICAL}
      var clicks=0
      val button=Button(activity).apply{text="native callback";setOnClickListener{clicks++}}
      val password=EditText(activity).apply{hint="Password";inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD;setText("never-return")}
      val checkbox=CheckBox(activity).apply{text="option"}
      root.addView(button);root.addView(password);root.addView(checkbox);activity.setContentView(root)
      activity.window.decorView.measure(android.view.View.MeasureSpec.makeMeasureSpec(800,android.view.View.MeasureSpec.EXACTLY),android.view.View.MeasureSpec.makeMeasureSpec(1200,android.view.View.MeasureSpec.EXACTLY));activity.window.decorView.layout(0,0,800,1200)
      val entries=NativeAutomation.list();val rows=(0 until entries.length()).map{entries.getJSONObject(it)}
      val target=rows.single{it.optString("label")=="native callback"}
      NativeAutomation.dispatch(context,"automation.ui.invoke",JSONObject().put("controlId",target.getString("controlId")))
      assertEquals(1,clicks)
      val secret=rows.single{it.optString("label")=="Password"};assertTrue(secret.getBoolean("sensitive"));assertFalse(secret.has("value"));assertFalse(entries.toString().contains("never-return"))
      val check=rows.single{it.optString("label")=="option"};NativeAutomation.dispatch(context,"automation.ui.set",JSONObject().put("controlId",check.getString("controlId")).put("checked",true));assertTrue(checkbox.isChecked)
      button.isEnabled=false
      try{NativeAutomation.dispatch(context,"automation.ui.invoke",JSONObject().put("controlId",target.getString("controlId")));fail()}catch(_:IllegalStateException){}
      assertEquals(1,clicks)
    }finally{NativeAutomation.setEnabled(context,false);controller.pause().stop().destroy()}
  }
}
