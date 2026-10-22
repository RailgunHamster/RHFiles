package com.railgunhamster.rhfiles

import android.graphics.Bitmap
import androidx.camera.core.ImageProxy
import zxingcpp.BarcodeReader

/** Instantiate on the single analysis worker; camera and fixture tests use the
 * exact same native decoder and strict pairing parser. */
internal class PairingQrReader {
  private val reader=BarcodeReader(BarcodeReader.Options(formats=setOf(BarcodeReader.Format.QR_CODE),tryHarder=true,tryRotate=true,tryDownscale=true,maxNumberOfSymbols=1))
  private fun pairing(values:List<BarcodeReader.Result>):String?=values.firstNotNullOfOrNull{it.text?.takeIf{value->value.startsWith("rhfiles-connect:v1:")||value.startsWith("rhfiles-group-")}}?.also{DeviceGroups.describe(it)}
  fun read(image:ImageProxy)=pairing(reader.read(image))
  fun read(bitmap:Bitmap)=pairing(reader.read(bitmap))
}
