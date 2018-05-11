import React, { Component, PureComponent } from 'react'

import { Form, Icon, Input, Button, message, Row, Col } from 'antd'
import BTFetch from '../utils/BTFetch'
import BTCryptTool from '@bottos-project/bottos-crypto-js'
import './styles.less'
import BTIpcRenderer from '../tools/BTIpcRenderer'
import {exportFile} from '../utils/BTUtil'
import {FormattedMessage} from 'react-intl'
import {isUserName} from '../tools/BTCheck'

import ConfirmButton from './ConfirmButton'

import messages from '../locales/messages'
const HeaderMessages = messages.Header;
const LoginMessages = messages.Login;
const FormItem = Form.Item;


function BTRegistSuccess(props) {
  function downloadKeystore() {
    BTIpcRenderer.exportKeyStore(props.username, props.cryptStr);
  }

  return (
    <div style={{textAlign: 'center'}}>
      <p style={{margin: '20px auto', fontSize: 16}}>
        <FormattedMessage {...HeaderMessages.YourAccountHasBeenRegisteredSuccessfully}/>
      </p>
      <Button type="primary" onClick={downloadKeystore}>
        <FormattedMessage {...HeaderMessages.BackupYourKeystore}/>
      </Button>
    </div>
  )
}


const formItemLayout = {
    labelCol: {
        xs: { span: 24 },
        sm: { span: 8 },
    },
    wrapperCol: {
        xs: { span: 24 },
        sm: { span: 16 },
    },
};

class Regist extends PureComponent {
    constructor(props){
        super(props);
        this.state = {
            img_data:'', // 验证码图片
            id_key: '', // 验证码 id
            isRegistered: false,
            // 下面两个是 BTRegistSuccess 需要的参数
            username: '',
            cryptStr: ''
        }

        this.onHandleSubmit = this.onHandleSubmit.bind(this)
    }

    registSuccess({cryptStr, username}) {
        this.setState({
            isRegistered: true,
            cryptStr,
            username
        })
    }

    clearFields = () => {
        const {setFieldsValue} = this.props.form;

        setFieldsValue({
            username:'',
            password:'',
            newpassword:'',
            email:'',
        })
    }

    async onHandleSubmit(e) {
        e.preventDefault()
        message.destroy();
        const { getFieldsValue } = this.props.form;
        let fieldValues = getFieldsValue()
        // 获取表单参数
        let username = fieldValues.username;

        // 检查username
        if(!isUserName(username)) {message.error(window.localeInfo["Header.UserNameIsNotRight"]);return}

        // let role_type = fieldValues.role_type;
        let email = fieldValues.email;
        let password = fieldValues.password;
        let surePassword = fieldValues.newpassword;
        let verificationCode = fieldValues.verificationCode;
        //新增参数
        let msg = fieldValues.msg;
        let phone = fieldValues.phone;
        let contacts = fieldValues.contacts;
        let contactsPhone = fieldValues.contactsPhone;

        // !(new RegExp(/^{8,}$/, "g").test(password))
        if(username==undefined){message.error(window.localeInfo["Header.PleaseEnterTheUserName"]); return}
        if(password==undefined){message.error(window.localeInfo["Header.PleaseEnterThePassword"]); return}
        else if(password.length < 8){
            message.error(window.localeInfo["Header.ThePasswordShouldContainAtLeast8BitCharacters"]);
            return;
        }
        if(password != surePassword){
            message.error(window.localeInfo["Header.IncorrectPasswordEnteredTwice"]);
            return;
        }

        // 判断验证码
        // if(verificationCode==undefined){message.error(window.localeInfo["Header.PleaseEnterTheVerificationCode"]); return}

        // 生成两对公私钥
        let owner_keys = await BTCryptTool.createPubPrivateKeys();
        let active_keys = await BTCryptTool.createPubPrivateKeys();

        // 两对公钥
        let owner_pub_key = owner_keys.publicKey;
        let active_pub_key = active_keys.publicKey;

        let owner_pub_key_str = owner_pub_key.toString()
        let active_pub_key_str = active_pub_key.toString()

        let owner_pub_key_param = owner_pub_key_str.slice(3,owner_pub_key_str.length)
        let active_pub_key_param = active_pub_key_str.slice(3,active_pub_key_str.length)

        // 两对私钥
        let owner_private_key = owner_keys.privateKey;
        let active_private_key = active_keys.privateKey;

        // 两对sign时用的私钥
        let owner_private_wif = owner_keys.privateWif;
        let active_private_wif = active_keys.privateWif;

        // 生成encypted_info  owner_pub_key
        let info = {email}
        let encypted_info = BTCryptTool.aesEncrypto(JSON.stringify(info),password);
        let decrypted = BTCryptTool.aesDecrypto(encypted_info,password)

        // 创建签名  username +owner_pub_key +active_pub_key
        let signKey = username + owner_pub_key + active_pub_key;
        let signature_account = BTCryptTool.sign(signKey,owner_private_wif);

        // 创建signature_user  username +owner_pub_key +active_pub_key +info +signature_account
        let signature_user_key = username + owner_pub_key + active_pub_key + signature_account;
        let signature_user = BTCryptTool.sign(signature_user_key,owner_private_wif);

        // 发送注册请求
        let params = {};
        params = {
            username:username,
            user_info:{
                encypted_info:encypted_info.toString(),
                // role_type, // 0:数据提供  1:数据招募 2:数据审核
            },
            owner_pub_key:owner_pub_key_param,
            active_pub_key:active_pub_key_param,
            signature_account:signature_account,
            signature_user:signature_user,
            id_key: this.state.id_key,
            verify_value: verificationCode
        }
        // 将两对私钥加密以后存储到本地
        let privateKeys = {
            account_name:username,
            code:'0',
            owner_private_key:owner_private_key.toString(),
            owner_private_wif,
            active_private_key:active_private_key.toString(),
            active_private_wif
        }

        // 对两对私钥进行加密后存储成keystore文件
        let reqUrl = '/user/register'
        BTFetch(reqUrl,'POST',params)
        .then(response => {
            if (response && response.code == '0') {
                message.success(window.localeInfo["Header.YourRegistrationHasBeenSuccessfullyCompleted"]);
                let privateKeyStr = JSON.stringify(privateKeys)
                let cryptStr = BTCryptTool.aesEncrypto(privateKeyStr,password)
                // 创建本地用户目录
                BTIpcRenderer.mkdir(username)
                // 存储keystore文件到本地
                BTIpcRenderer.saveKeyStore({username:username,account_name:username},cryptStr)

                this.registSuccess({ cryptStr, username })
                this.clearFields()
            } else if (response && response.code=='1103') {
                message.warning(window.localeInfo["Header.AccountHasAlreadyExisted"]);
            } else if (response && response.code=='-8') {
                // message.warning(window.localeInfo["Header.AccountHasAlreadyExisted"]);
                message.warning('验证码错误');
            } else {
                message.error(window.localeInfo["Header.FailedRegister"]);
            }
        })
        .catch(error => {
            message.error(window.localeInfo["Header.FailedRegister"],error);
        })

    }

    // 将两对私钥加密后存储到本地
    // exportKeystore(privateKeys, password) {
    //     let privateKeyStr = JSON.stringify(privateKeys)
    //     let cryptStr = BTCryptTool.aesEncrypto(privateKeyStr,password)
    //     this.registSuccess({
    //         cryptStr,
    //         isRegist:true
    //     })
    // }


    // TODO: 等后端部署了验证码功能，就可以用了
    // requestVerificationCode = () => {
    //
    //   BTFetch('/user/GetVerificationCode', 'get').then(res => {
    //     if (res.code == 1 && res.msg == 'OK') {
    //       this.setState({
    //         img_data: res.data.img_data,
    //         id_key: res.data.id_key,
    //       })
    //       // console.log('register res', res);
    //     } else {
    //       console.error('请求验证码出错', res);
    //     }
    //   })
    //
    // }
    //
    // componentDidMount() {
    //   this.requestVerificationCode()
    // }

    render() {

      if (this.state.isRegistered) {
        const {cryptStr, username} = this.state
        return <BTRegistSuccess cryptStr={cryptStr} username={username} />
      }

      const { getFieldDecorator, getFieldsError, getFieldError, isFieldTouched } = this.props.form;

      return (

        <div className="register">
            <div className='route-children-container-title'><FormattedMessage {...HeaderMessages.Register}/></div>
            <Form style={{maxWidth: 560, paddingRight: '10%'}}>

              <FormItem {...formItemLayout} colon={false} label={<FormattedMessage {...LoginMessages.Account} />}>
                  {
                      getFieldDecorator('username',{})(
                          <Input placeholder={window.localeInfo["Header.PleaseEnterTheUserName"]} id="error1" />
                      )
                  }
              </FormItem>
              <FormItem {...formItemLayout} colon={false} label={<FormattedMessage {...LoginMessages.Password} />}>
                  {
                      getFieldDecorator('password',{})(
                          <Input placeholder={window.localeInfo["Header.PleaseEnterThePassword"]} type="password" id="error2" />
                      )
                  }
              </FormItem>
              <FormItem {...formItemLayout} colon={false} label={<FormattedMessage {...LoginMessages.ConfirmPassword} />}>
                  {
                      getFieldDecorator('newpassword',{})(
                          <Input placeholder={window.localeInfo["Header.PleaseEnterTheSurePassword"]} type="password" id="error1"/>
                      )
                  }
              </FormItem>

              {/* 这部分是验证码功能，先暂时隐藏起来 */}
              {/* <FormItem {...formItemLayout}>
                <Row gutter={8}>
                  <Col span={16}>
                    {
                      getFieldDecorator('verificationCode', {}) (
                        <Input placeholder={window.localeInfo["Header.PleaseEnterTheVerificationCode"]} id="error1"/>
                      )
                    }
                  </Col>
                  <Col span={8}>
                    {this.state.img_data
                      ?
                      <img height='28px'
                        style={{marginBottom: 6, cursor: 'pointer'}}
                        onClick={this.requestVerificationCode}
                        src={this.state.img_data} />
                      :
                      <Icon type='spin' />
                    }
                  </Col>
                </Row>
              </FormItem> */}

            </Form>

            <div style={{textAlign: 'center'}}>
              <ConfirmButton onClick={this.onHandleSubmit} htmlType="submit">
                <FormattedMessage {...HeaderMessages.Register} />
              </ConfirmButton>
            </div>
        </div>
      )
    }
}

const RegistForm = Form.create()(Regist);


export default RegistForm
