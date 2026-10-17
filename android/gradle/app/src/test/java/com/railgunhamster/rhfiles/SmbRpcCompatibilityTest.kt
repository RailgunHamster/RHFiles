package com.railgunhamster.rhfiles

import com.rapid7.client.dcerpc.transport.SMBTransportFactories
import org.junit.Test
import org.junit.Assert.*
import org.objectweb.asm.*
import java.io.File
import java.util.jar.JarFile

/** Fail before release if the RPC adapter calls removed/changed SMBJ methods. */
class SmbRpcCompatibilityTest {
  @Test fun rpcAdapterBytecodeLinksAgainstTheShippedSmbjVersion(){
    val loader=SMBTransportFactories::class.java.classLoader;var checked=0
    JarFile(File(requireNotNull(SMBTransportFactories::class.java.protectionDomain).codeSource.location.toURI())).use{jar->
      for(entry in jar.entries().asSequence().filter{it.name.endsWith(".class")&&(it.name.startsWith("com/rapid7/helper/")||it.name.startsWith("com/rapid7/client/dcerpc/transport/"))}){
        val reader=ClassReader(jar.getInputStream(entry));reader.accept(object:ClassVisitor(Opcodes.ASM9){
          override fun visitMethod(access:Int,name:String,descriptor:String,signature:String?,exceptions:Array<out String>?):MethodVisitor=object:MethodVisitor(Opcodes.ASM9){
            override fun visitMethodInsn(opcode:Int,owner:String,name:String,descriptor:String,isInterface:Boolean){
              if(!owner.startsWith("com/hierynomus/"))return
              val target=Class.forName(owner.replace('/','.'),false,loader)
              val found=if(name=="<init>")target.declaredConstructors.any{Type.getConstructorDescriptor(it)==descriptor}
                else generateSequence(target){it.superclass}.flatMap{it.declaredMethods.asSequence()}.plus(target.methods.asSequence()).any{it.name==name&&Type.getMethodDescriptor(it)==descriptor}
              assertTrue("RPC/SMBJ binary API mismatch: $owner.$name$descriptor",found);checked++
            }
          }
        },ClassReader.SKIP_DEBUG or ClassReader.SKIP_FRAMES)
      }
    }
    assertTrue("No SMBJ call sites checked",checked>=10)
    println("Verified $checked RPC-to-SMBJ method references")
  }
}
